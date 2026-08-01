# 은행 출금/입금 분리 컬럼 지원 + 헤더 별칭 확장

- 날짜: 2026-08-01
- 상태: 승인됨
- 대상: `src/lib/csv`, `src/lib/pdf`, `src/types/mapping.ts`, `src/app/upload/mapping/MappingClient.tsx`, `src/components/ui/rows.tsx`

## 배경

좌표 파서 버그(미인식 컬럼이 밴드 경계를 오염)는 별도 커밋으로 수정됨. 그러나 다른
카드사/은행 포맷 대비에는 구조적 공백이 남아 있다:

- `ColumnRole = date | merchant | amount | category` 뿐이라 **은행 거래내역의
  출금액/입금액 분리 컬럼**을 표현할 수 없다.
- `출금액`·`입금액`은 둘 다 `금액`(amount) 별칭에 걸려 `matchColumnRole`이 하나만
  잡고, 입금(수입) 행은 amount 셀이 비어 **조용히 드롭**된다.

CLAUDE.md가 명시한 타깃은 "CSV(은행 거래내역 · 카드 명세서)"이므로 은행 이중 컬럼은
반드시 지원해야 한다.

## 목표 / 비목표

**목표**
- 은행 거래내역의 `출금액`/`입금액` 분리 컬럼을 인식해 금액+방향을 올바르게 도출
- 헤더 별칭 사전 확장(실사용 라벨 변형)
- CSV·PDF 두 경로에 일관 적용, 카드 단일 amount 경로는 불변

**비목표**
- 스캔본(text layer 없음)·미지원 포맷의 에러 UX 개선 (별도 스코프)
- 다중 파일 병합·중복 감지 (로드맵)

## 설계

### 1. 핵심 추상화: `resolveAmountDirection`

CSV `applyMapping`과 PDF `extractRowsToTransactions`에 중복된 금액+방향 도출 로직을
`src/lib/csv/index.ts`의 단일 함수로 통합한다.

```ts
export function resolveAmountDirection(cells: {
  amount?: string
  debit?: string
  credit?: string
  incomeSignalText?: string
}): { amount: number; direction: Direction } | null
```

규칙:
- **debit/credit 중 하나라도 값이 있으면(은행 이중 컬럼)**
  - credit만 유효 → `income`, amount = credit
  - debit 유효 → `expense`, amount = debit (둘 다 유효한 이상 행은 debit 우선)
  - 둘 다 무효 → `null`(드롭)
- **debit/credit이 없고 amount만 있으면(카드 단일 컬럼)**
  - 기존 로직: `normalizeAmount`의 `isCredit`(괄호/음수) 또는
    `incomeSignalText`에 `환불|취소|입금|급여|수입` → `income`, 아니면 `expense`

### 2. 새 role: `debit` | `credit`

`src/types/mapping.ts`의 `ColumnRole`에 `'debit' | 'credit'` 추가. `Record<ColumnRole, …>`을
쓰는 지점(`ROLE_LABELS`, `mapping`)은 TS가 누락을 강제 검출한다.

### 3. `src/lib/csv/aliases.ts`

- 별칭 추가:
  - `debit: ['출금액', '출금', '인출', '지급액']`
  - `credit: ['입금액', '입금', '예치', '받은금액']`
- `ROLE_ORDER`를 `['date', 'merchant', 'debit', 'credit', 'amount', 'category']`로 변경.
  `출금액`은 `금액`(amount) 별칭 substring에 걸리므로, debit/credit을 amount보다 먼저
  검사해야 debit/credit으로 잡힌다. 카드 `이용금액`은 debit/credit 미매칭 → amount 유지.
- 공유 헬퍼:
  - `hasRequiredRoles(present: Set<ColumnRole>)` = date && merchant && (amount || debit || credit)
  - `missingRequiredRoles(mapping)` = 부족한 필수 role 목록 (amount류가 전무하면 대표로 `amount`)

### 4. 소비처 적용

- `csv/index.ts applyMapping`: debit/credit 인덱스도 읽어 `resolveAmountDirection` 호출.
  필수 검증은 date·merchant 필수 + amount/debit/credit 중 최소 하나.
- `csv/mapping.ts mapColumns`: mapping에 debit/credit 포함, `missingRequiredRoles`로 판정.
- `pdf/extract.ts`: `detectColumns`의 필수 검사를 `hasRequiredRoles(seen)`로 교체.
  `extractRowsToTransactions`는 `resolveAmountDirection`으로 금액+방향 도출.
- `MappingClient.tsx`: `ROLE_OPTIONS`에 출금액·입금액 추가, 필수 판정을 `missingRequiredRoles` 공유.
- `rows.tsx ROLE_LABELS`: 출금액·입금액 라벨 추가.

### 5. 데이터 흐름 (은행 CSV 예)

```
헤더: 거래일시 | 적요 | 출금액 | 입금액 | 잔액
행:  2026-07-01 | 스타벅스 | 4,500 |        | 120,000  → expense 4500
행:  2026-07-05 | 급여     |       | 3,000,000 | ...     → income 3000000
```
`잔액`은 어떤 role에도 매칭되지 않아 무시된다.

## 테스트 (TDD)

각 단위 실패 테스트 선행:
- `resolveAmountDirection`: debit→expense, credit→income, 둘 다 빈 값→null, amount 단일 경로 유지, 키워드 income
- aliases: `출금액`→debit, `입금액`→credit, `이용금액`→amount(회귀), 우선순위
- `mapColumns`: 은행 헤더로 debit/credit 매핑, missingRequired 판정
- `applyMapping`: 출금 행→expense, 입금 행→income, 잔액 컬럼 무시
- `pdf/extract`: 출금액/입금액 분리 헤더 표 추출

## 불변 / 위험

- 카드 단일 amount 경로와 기존 189개 테스트는 그대로 통과해야 한다.
- 위험: ROLE_ORDER 재정렬이 기존 매칭을 바꿀 수 있음 → 카드 `이용금액`·`결제금액`
  회귀 테스트로 방어.
