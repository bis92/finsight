# Step 0: transactions-repo-live

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (외부 API·시크릿 server-only · RLS user-scoped 접근 · service-role은 Polar 웹훅 plan 갱신에만 · `amount`는 부호 없는 정수+`direction` · `category`는 enum · mock은 services 뒤에만)
- `/docs/ARCHITECTURE.md` ("데이터 모델" 절 — `transactions` 컬럼 · RLS `user_id = auth.uid()` · 시임 인터페이스 · "보안" 절)
- `/docs/ADR.md` (ADR-008 mock-first `DATA_SOURCE`, ADR-009 RLS·완전삭제, ADR-002 service-role 용도 제한)
- `/src/services/types.ts` (`TransactionsRepository` 인터페이스 — 이 시그니처를 그대로 구현한다)
- `/src/services/mock/transactions.ts` (mock 구현 — 반환 타입·행위 계약을 참고. live는 **완전히 동일한 반환 타입**이어야 한다)
- `/src/services/index.ts` (`getTransactionsRepository` 팩토리 — 여기에 live 분기를 추가한다)
- `/src/types/transaction.ts` (`Transaction`·`NewTransaction`·`Category`·`Direction`·`DateRange` 계약)
- `1-supabase/step3` 산출물: `/src/lib/supabase/server-client.ts` (user-scoped Supabase 클라이언트 — 이 클라이언트를 경유해 DB에 접근한다), `/src/types/database.ts` (DB 행 타입)

이전 코드를 꼼꼼히 읽고 시임 계약과 RLS 격리 모델을 이해한 뒤 작업하라.

## 배경 (phase 3 전체 맥락)

이 phase(`3-data-live`)는 `1-supabase`·`2-auth` 완료를 전제로, mock-first(ADR-008)로 완성된 `0-mvp`를 실연동으로 교체하는 데이터 계층 phase다. **`DATA_SOURCE=live` 컷오버는 마지막 `6-launch`에서 한 번만** 한다 — 이 phase에서는 mock 동작을 유지한 채 live 구현체만 추가한다. 테스트는 실네트워크가 아니라 **Supabase 클라이언트를 목킹한 단위 테스트**로 검증한다. 이 step은 그 첫 조각으로 `TransactionsRepository`의 live 구현을 만든다.

## 작업

**TDD 필수** — Supabase 클라이언트를 목킹한 단위 테스트를 먼저 작성하고, 통과하는 구현을 작성한다. 실네트워크 호출 금지.

1. **live 구현 추가** — `src/services/live/transactions.ts`
   - 파일 상단에 `import 'server-only'`를 둔다(서버 전용). mock 구현과 동일하게 클라이언트 컴포넌트에서 import 금지.
   - `TransactionsRepository`(`src/services/types.ts`)를 그대로 구현한다:
     ```ts
     listByUser(userId: string, range?: DateRange): Promise<Transaction[]>
     insertMany(userId: string, txns: NewTransaction[]): Promise<{ inserted: number }>
     reclassify(userId: string, txnId: string, category: Category): Promise<Transaction>
     ```
   - 모든 DB 접근은 **`src/lib/supabase/server-client.ts`의 user-scoped 클라이언트를 경유**한다. `transactions` 테이블에 대해:
     - `listByUser` — `select`로 조회. `range`가 있으면 `occurred_on`에 `gte(from)`/`lte(to)` 필터. 정렬은 `occurred_on` 기준(대시보드 표시 순서). DB 행(`snake_case`)을 `Transaction`(`camelCase`) 도메인 타입으로 매핑한다.
     - `insertMany` — `NewTransaction[]`을 DB 행으로 매핑해 `insert`. `user_id`는 인자 `userId`로 채운다. 반환은 `{ inserted: <삽입된 행 수> }`. 빈 배열이면 DB 호출 없이 `{ inserted: 0 }`.
     - `reclassify` — 해당 `txnId`의 `category`만 `update`하고, 갱신된 행을 `Transaction`으로 반환한다. 매칭 행이 없으면 mock과 동일하게 명확한 에러를 throw(예: `throw new Error('Transaction not found')`).
   - **DB↔도메인 매핑**은 이 파일 내부(또는 작은 헬퍼)에 가둔다. `amount`는 정수 그대로, `direction`·`category`·`occurred_on`(→`occurredOn`)·`upload_id`(→`uploadId`)·`raw`(jsonb→객체) 등을 왕복 매핑한다.

2. **핵심 규칙 (CRITICAL)**
   - **user-scoped 클라이언트만 사용한다.** 크로스테넌트 격리는 RLS(`user_id = auth.uid()`)에 맡긴다. 쿼리에서 `user_id` 컬럼을 명시적으로 필터할 수는 있으나, 격리의 진실 원천은 RLS다. 이유: ADR-009·CLAUDE.md — 유저 데이터 접근은 RLS가 켜진 user-scoped 클라이언트로.
   - **`amount`는 부호 없는 정수(KRW 원)로만** 저장/조회한다. 부호로 지출/수입을 표현하지 마라. 지출/수입 구분은 `direction`(`'expense'|'income'`)으로만. 이유: CLAUDE.md CRITICAL — 부호 저장 시 파서별로 흔들려 집계가 깨진다.
   - **`category`는 `src/types`의 고정 enum만** 허용한다. DB에서 읽은 값도 enum으로 취급하되, 매핑 시 자유 문자열이 흘러들지 않게 한다. 이유: CLAUDE.md — 자유 문자열 금지.

3. **팩토리 live 분기 추가** — `src/services/index.ts`
   - `getTransactionsRepository()`가 `getDataSource() === 'live'`일 때 `liveTransactionsRepository`(신규)를 반환하도록 분기를 추가한다.
   - **다른 팩토리(`getUploadsService`·`getProfileService`·`getLlmService`)는 이 step에서 건드리지 않는다** — `assertMockDataSource`/throw 유지 가능(이후 step에서 각각 교체). 기존 mock 분기·mock 반환은 그대로 둔다.
   - CRITICAL: `getDataSource`의 기본값 `'mock'`을 바꾸지 마라. live 컷오버는 6-launch 전용이다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(Supabase 클라이언트 목킹, 실네트워크 없음):
  - `liveTransactionsRepository.listByUser`가 목킹된 DB 행을 `Transaction` 도메인 타입으로 매핑해 반환하고, `range` 인자 시 `gte`/`lte` 필터를 건다.
  - `insertMany`가 `NewTransaction[]`을 `user_id` 채워 insert하고 `{ inserted: N }`을 반환하며, 빈 배열이면 DB 호출 없이 `{ inserted: 0 }`.
  - `reclassify`가 category만 update한 `Transaction`을 반환하고, 미존재 시 throw.
  - 매핑이 `amount`(정수)·`direction`·`category`(enum)를 왕복 보존하는지 검증.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - live 구현이 **user-scoped 클라이언트만** 쓰는가? service-role 클라이언트를 import하지 않는가?
   - `amount`가 부호 없는 정수이고 지출/수입은 `direction`으로만 구분되는가?
   - `category`가 enum으로만 다뤄지는가?
   - live/mock 반환 타입이 완전히 동일한가(`TransactionsRepository` 시그니처 준수)?
   - `getTransactionsRepository`만 live 분기가 추가되고 다른 팩토리·`DATA_SOURCE` 기본값은 불변인가?
3. 결과에 따라 `phases/3-data-live/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "live transactions repo 구현·매핑·팩토리 분기 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- service-role 클라이언트(`src/lib/supabase/service-role-client.ts`)를 이 구현에서 사용하지 마라. 이유: CLAUDE.md CRITICAL — service-role은 RLS를 우회하며 Polar 웹훅 plan 갱신에만 쓴다.
- `amount`를 부호로 저장/조회하거나 음수를 허용하지 마라. 이유: 파서별로 흔들려 집계가 깨진다.
- `category`에 enum 밖 자유 문자열을 허용하지 마라. 이유: 집계·렌더 계약 위반.
- 다른 팩토리(`uploads`/`profile`/`llm`)의 live 분기나 `DATA_SOURCE` 기본값을 이 step에서 바꾸지 마라. 이유: 각각 이후 step scope이며 컷오버는 6-launch 전용이다.
- mock 구현(`src/services/mock/transactions.ts`)을 수정하지 마라. 이유: mock 동작은 이 phase 내내 유지된다.
- 실제 Supabase 네트워크 호출을 테스트에 넣지 마라. 이유: 클라이언트 목킹 단위 테스트로 검증한다.
- 기존 테스트를 깨뜨리지 마라.
