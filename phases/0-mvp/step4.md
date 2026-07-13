# Step 4: mock-services

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (mock은 services 뒤에만 · 시임 인터페이스 2개만 형식화 · 플랜별 모델 · service-role 규칙)
- `/docs/ARCHITECTURE.md` (mock-first 시임 · 시임 인터페이스 · 데이터 흐름 · DATA_SOURCE 스위치)
- `/docs/ADR.md` (ADR-003 플랜별 모델, ADR-008 mock-first)
- `/docs/PRD.md` (게스트 데모 fixture · Free/Pro 기능)
- Step 0: `src/lib/env.ts` (`getDataSource`)
- Step 1: `src/types/` (전 계약 타입)
- Step 3: `src/lib/analysis/` (aggregate/classify/detectSubscriptions — mock LlmService가 재사용 가능)

이전 step 코드를 꼼꼼히 읽고, 시임 계약을 이해한 뒤 작업하라.

## 작업

**TDD 필수** — mock repository의 결정적 반환을 테스트로 고정한다.

`src/services/`에 데이터소스 구현을 둔다. Phase 0은 **mock만** 구현하되, `DATA_SOURCE` 스위치로 live를 나중에 끼울 수 있는 구조를 만든다(live 구현체는 만들지 않음 — throw 또는 미구현 스텁).

1. **시임 인터페이스 형식화(2개만)** — `src/services/types.ts` 또는 각 파일
   - `TransactionsRepository` (ARCHITECTURE.md 48행):
     ```ts
     interface TransactionsRepository {
       listByUser(userId: string, range?: DateRange): Promise<Transaction[]>
       insertMany(userId: string, txns: NewTransaction[]): Promise<{ inserted: number }>
       reclassify(userId: string, txnId: string, category: Category): Promise<Transaction>
     }
     ```
   - `LlmService` (ARCHITECTURE.md 53행):
     ```ts
     interface LlmService {
       mapColumns(input: ColumnMappingInput): Promise<ColumnMappingResult>
       generateInsights(agg: AggregateSnapshot, plan: Plan): Promise<Insight[]>
       detectSubscriptions(txns: Transaction[]): Promise<SubscriptionCandidate[]>
     }
     ```
   - CRITICAL: 시임은 이 2개만 인터페이스로. uploads·profiles는 **단순 함수**로(형식 인터페이스 금지). 이유: CLAUDE.md.

2. **mock 구현** — `src/services/mock/`
   - `mockTransactionsRepository`: 결정적 fixture 거래 반환. `insertMany`는 메모리 반영 or 카운트만(결정적). `reclassify`는 해당 txn category 교체본 반환.
   - `mockLlmService`:
     - `mapColumns` — 결정적 매핑 결과(대표 한국 카드사 헤더 기준, `confidence`·`missingRequired` 포함). 실제 Claude 호출 금지.
     - `generateInsights` — plan에 따라 다른 mock Insight 배열. Free=요약형 1~2개, Pro=진단+절감제안 다수(구조화). 숫자는 인자 `agg`에서 가져와 자연스러운 평문 텍스트로(마크다운 금지).
     - `detectSubscriptions` — Step 3 `lib/analysis`의 규칙 함수를 재사용해 후보 반환(mock이지만 결정적).
   - `mockProfile`/`mockUploads` 관련 단순 함수(예: `getProfile(userId): Promise<Profile>` — 기본 plan 반환. Pro 화면 테스트를 위해 mock에서 plan을 바꿀 수 있는 방법을 두되, **클라이언트 입력으로 plan을 바꾸지 않는다**).
   - **fixtures** — `src/services/mock/fixtures/`에 게스트 데모/대시보드용 결정적 샘플 거래·프로필. PRD 게스트 데모(가입 없이 읽기전용 체험)의 데이터 원천.

3. **스위치** — `src/services/index.ts`
   - `getDataSource()`(Step 0) 기준으로 repository/llm 구현을 선택하는 팩토리(예: `getTransactionsRepository()`, `getLlmService()`, `getProfileService()`, `getUploadsService()`).
   - `DATA_SOURCE==='live'`면 아직 미구현 → 명확한 throw(`new Error('live not implemented')`). Phase 1에서 교체.
   - CRITICAL: 이 팩토리·구현은 **서버에서만** import되도록 설계한다(다음 step api-routes에서 호출). 클라이언트 컴포넌트에서 import 금지 대상임을 파일 상단 주석으로 명시. 이유: CLAUDE.md — 외부 API·시크릿은 서버 전용.
   - mock/real 반환 타입은 **완전히 동일**해야 한다(ADR-008). mock은 결정적 값 반환.

## Acceptance Criteria

```bash
npm run build
npm test        # mock repository/llm 결정적 반환 테스트 통과
```

- 테스트 최소: `mockLlmService.mapColumns`가 유효한 `ColumnMappingResult`를 반환, `generateInsights`가 Free/Pro에서 서로 다른 개수/kind, `mockTransactionsRepository.listByUser`가 fixture 반환·`reclassify`가 category 교체.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 시임 인터페이스가 정확히 2개(TransactionsRepository·LlmService)인가? uploads/profiles는 단순 함수인가?
   - mock이 `services/` 뒤에만 있고 queries/컴포넌트에 없는가?
   - 실제 외부 SDK(@anthropic-ai/sdk, supabase, polar) 호출이 없는가(mock)?
   - `DATA_SOURCE` 스위치로 구현을 고르는가? live는 안전하게 throw하는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "mock 서비스·팩토리·fixture 위치 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- mock 데이터를 `queries/`나 컴포넌트에 두지 마라. 반드시 `services/` 뒤에만. 이유: CLAUDE.md CRITICAL — phase 1 실연동 시 UI 불변.
- uploads/profiles를 인터페이스로 형식화하지 마라(단순 함수). 이유: 시임은 2개만.
- 실제 Claude/Supabase/Polar를 호출하지 마라. 이유: Phase 0은 mock.
- 클라이언트가 보낸 plan 값으로 mock plan을 바꾸는 경로를 만들지 마라. 이유: plan 진실 원천 규칙.
- 기존 테스트를 깨뜨리지 마라.
