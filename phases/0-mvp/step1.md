# Step 1: core-types

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (category enum·amount 규칙·direction 규칙)
- `/docs/ARCHITECTURE.md` (시임 인터페이스 · 데이터 모델 테이블 · ColumnMapping 계약)
- `/docs/ADR.md` (ADR-003 플랜별 모델, ADR-005 구조화 JSON)
- `/docs/PRD.md` (핵심 기능 · 과금 모델)
- `/docs/DESIGN.md` (**카테고리 enum 13종 확정본** — 핵심결정 #2 · LLM 출력 세그먼트 강조 #3)
- Step 0 산출물: `src/lib/env.ts`, `src/app/`, `tsconfig.json`(strict·`@` alias 확인)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`src/types/`에 프로젝트 전역 **계약 타입**을 정의한다. 이 타입들은 이후 모든 레이어(lib·services·api·queries·components)가 공유하는 단일 계약이다. 런타임 로직은 넣지 말고 타입 + enum + 소량의 순수 헬퍼(예: category 목록/라벨)만 둔다.

파일 구성(도메인별 분리, `src/types/index.ts`에서 배럴 export):

1. **`transaction.ts`**
   - `Category` — 고정 enum(자유 문자열 금지). CRITICAL: **`DESIGN.md` 핵심결정 #2의 병합안 13종을 확정본으로 쓴다**(ARCHITECTURE.md의 옛 목록을 이 값으로 대체):
     `식비 · 카페/간식 · 교통 · 쇼핑 · 구독 · 주거 · 공과금 · 문화/여가 · 의료 · 금융 · 교육 · 수입 · 기타`. 이유: 디자인 원본(도넛/바 팔레트·화면 카피)이 이 세트를 전제한다. string union type 또는 const 객체 + union 중 택1(strict friendly).
     - `수입`은 지출 카테고리가 아니라 `direction='income'` 거래의 표시 레이블로 쓴다(집계 시 지출 카테고리와 혼용 금지).
   - `Direction = 'expense' | 'income'`
   - `Transaction` — `{ id, userId, uploadId, occurredOn(YYYY-MM-DD string), merchant, amount(정수 KRW ≥0), direction, category, raw(unknown/Record) }`
   - `NewTransaction` — insert용(`id`·`userId` 제외 또는 옵셔널). amount는 **부호 없는 정수**.
   - `DateRange = { from: string; to: string }` (YYYY-MM-DD)
   - CRITICAL: `amount`는 부호 없는 정수(원). 부호로 지출/수입을 표현하는 타입을 만들지 마라. 지출/수입은 `direction`으로만. 이유: 파서별로 부호가 흔들려 집계가 깨진다.
   - 카테고리 한국어 라벨/전체 목록을 반환하는 순수 헬퍼(예: `CATEGORIES: Category[]`, `categoryLabel(c): string`)를 둔다(재분류 Modal·차트에서 사용).

2. **`plan.ts`**
   - `Plan = 'free' | 'pro'`
   - `Profile = { id; plan: Plan; polarSubscriptionId?: string|null; polarCustomerId?: string|null }`

3. **`upload.ts`**
   - `UploadStatus = 'parsing' | 'done' | 'error'`
   - `Upload = { id; userId; filePath; originalName; status; errorMessage?: string|null }`

4. **`mapping.ts`** (ARCHITECTURE.md 63~64행 계약 그대로)
   - `ColumnRole = 'date' | 'merchant' | 'amount' | 'category'` (매핑 대상 역할)
   - `ColumnMappingInput = { headers: string[]; sampleRows: string[][]; locale: 'ko-KR' }` — sampleRows는 데이터 행 최대 20개, 헤더 미포함.
   - `ColumnMappingResult = { mapping: Record<ColumnRole, number|null>; confidence: number; missingRequired: ColumnRole[] }`
     - `mapping` 값은 헤더 인덱스(또는 null). `confidence < 0.75` 또는 `missingRequired` 비어있지 않으면 자동확정 금지(로직은 후속 step, 여기선 타입만).

5. **`analysis.ts`** (ADR-005 구조화 출력)
   - `CategoryTotal = { category: Category; amount: number; ratio: number }`
   - `MerchantTotal = { merchant: string; amount: number; count: number }`
   - `AggregateSnapshot = { period: string; totalExpense: number; totalIncome: number; netExpense: number; byCategory: CategoryTotal[]; topMerchants: MerchantTotal[] }`
   - `Insight` — 진단/요약/제안 항목. CRITICAL(`DESIGN.md` 핵심결정 #3): 강조는 마크다운/HTML이 아니라 **구조화 세그먼트 배열**로 표현한다 — `dangerouslySetInnerHTML` 금지, React 기본 이스케이프에 맡긴다.
     ```ts
     type InsightSegment = { text: string; emphasis: boolean }
     type Insight = {
       title: string
       segments: InsightSegment[]   // 평문 세그먼트. emphasis=true인 조각만 <strong> 스타일. HTML/마크다운 문자열 금지.
       kind: 'summary' | 'diagnosis' | 'suggestion'
       savingKrw?: number           // suggestion일 때 절감액(원, 부호없는 정수) — 녹색 표기용
     }
     ```
     - 렌더 신뢰경계는 UI step(11)에서 보장하되, 타입 자체가 원문 HTML 문자열을 담지 못하게 `segments` 배열로 강제한다.
   - `SubscriptionCandidate = { merchant: string; amount: number; cadence: 'monthly' | 'weekly' | 'unknown'; confidence: number; lastSeenOn: string }`
   - `Cadence` 등 재사용 타입은 export.

## Acceptance Criteria

```bash
npm run build   # 타입 컴파일 에러 없음
npm test        # 기존 테스트 + 신규 헬퍼 테스트 통과
```

- 순수 헬퍼(`CATEGORIES`, `categoryLabel`)에 대한 최소 테스트 1개 이상을 `src/types/transaction.test.ts`에 둔다(모든 Category가 라벨을 가진다 등).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `category`가 고정 enum인가(자유 문자열 불가)?
   - `amount`가 부호 없는 정수 + `direction` 조합인가?
   - `ColumnMappingInput`/`Result`가 ARCHITECTURE.md 계약과 일치하는가?
   - 타입만 두고 외부 API·런타임 로직을 넣지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "생성한 타입 파일·주요 export 이름 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- `category`를 자유 문자열(string)로 열어두지 마라. 이유: CLAUDE.md CRITICAL — 집계·재분류가 enum에 의존한다.
- `amount`에 부호(음수)를 허용하는 타입을 만들지 마라. 이유: direction과 이중표현되어 집계가 깨진다.
- 외부 SDK(@anthropic-ai/sdk, supabase, polar) import·호출을 하지 마라. 이유: 이 step은 순수 타입 계약이다.
- 기존 테스트를 깨뜨리지 마라.
