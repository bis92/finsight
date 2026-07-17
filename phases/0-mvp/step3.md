# Step 3: lib-analysis

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (TDD 강제 · amount/direction · category enum · 환불=income 정규화)
- `/docs/ARCHITECTURE.md` (집계는 코드·판단은 AI / 데이터 모델 / 구독 탐지)
- `/docs/ADR.md` (ADR-004 규칙기반 분류, ADR-005 집계는 코드, ADR-006 구독 후보)
- `/docs/PRD.md` (Free 대시보드 집계 · 정기구독 후보 · "확정 표현 금지")
- Step 1 산출물: `src/types/` (`transaction.ts`, `analysis.ts`)
- Step 2 산출물: `src/lib/csv/` (`NewTransaction` 생산 방식 참고)

이전 step의 타입·CSV 변환 결과를 꼼꼼히 읽고 작업하라.

## 작업

**TDD 필수** — 순수 함수. 테스트를 먼저 작성하고 통과 구현을 쓴다.

`src/lib/analysis/`에 결정론적 집계·규칙 기반 분류·구독 후보 탐지를 구현한다. **모든 숫자는 코드로 계산한다(LLM 금지).**

1. **규칙 기반 분류** — `classify(txn: NewTransaction | Transaction): Category`
   - 가맹점명 키워드 규칙으로 `Category` enum 매핑(예: 스타벅스/배달 → 식비, 지하철/택시 → 교통, 넷플릭스/유튜브프리미엄 → 구독 등). 매칭 없으면 `'기타'`.
   - `direction==='income'`이면 `'수입'` 계열로. 규칙 테이블은 `lib/analysis/rules.ts`로 분리해 확장 가능하게.
   - CRITICAL: 반환은 반드시 `Category` enum 값만. 자유 문자열 금지.
   - 배치 헬퍼 `classifyMany(txns): (NewTransaction & { category })[]` 제공(CLAUDE.md: 실제 분류는 규칙 기반 + 배치).

2. **집계** — `aggregate(txns: Transaction[], period: string): AggregateSnapshot`
   - `totalExpense` = direction==='expense' amount 합, `totalIncome` = income 합, `netExpense = totalExpense - totalIncome`.
   - `byCategory`: 지출 기준 카테고리별 합계 + `ratio`(카테고리합/총지출, 0~1). 내림차순.
   - `topMerchants`: 지출 기준 상위 가맹점 합계·건수(상위 N, 예: 5~10).
   - 부동소수 오차 주의 — amount는 정수(원)이므로 합계도 정수. ratio만 소수.
   - 빈 입력(거래 0건)에서 0/빈 배열을 안전 반환(대시보드 empty 상태).

3. **정기구독 후보 탐지** — `detectSubscriptions(txns: Transaction[]): SubscriptionCandidate[]`
   - merchant + amount 유사 + 반복 주기(cadence)로 후보 추출. 여러 달 데이터면 monthly/weekly 판정, 단일 월만 있으면 패턴 기반 후보(`cadence:'unknown'` 또는 낮은 confidence)로.
   - CRITICAL: **확정 표현 금지**(PRD). 반환은 어디까지나 "후보"이며 `confidence`로 불확실성을 표현한다. 규칙 우선(LLM 없이 코드로).

## Acceptance Criteria

```bash
npm run build
npm test        # 분류·집계·구독탐지 테스트 통과
```

- 테스트 최소: 카테고리 분류 매칭/미매칭, 집계 합계·ratio·netExpense(환불 income 반영), topMerchants 정렬, 구독 후보(다월 monthly / 단일월 unknown), 빈 입력 안전성.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 모든 숫자 집계가 코드로 계산되는가(LLM 미사용)?
   - `classify` 반환이 Category enum만인가?
   - netExpense가 지출−환입(income) 규칙과 일치하는가?
   - 구독 탐지가 "확정"이 아닌 confidence 기반 후보인가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "aggregate/classify/detectSubscriptions 시그니처·규칙 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 테스트 없이 구현부터 쓰지 마라. 이유: TDD 강제.
- 집계 숫자를 LLM에 계산시키지 마라. 이유: ADR-005 환각·불일치 방지, 집계는 코드.
- 구독을 "확정"으로 표현하지 마라(후보만). 이유: PRD 과금 모델.
- category에 자유 문자열을 반환하지 마라. 이유: enum 무결성.
- 기존 테스트를 깨뜨리지 마라.
