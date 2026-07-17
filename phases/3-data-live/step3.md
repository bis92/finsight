# Step 3: profile-read-live

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (plan의 유일한 진실 원천은 Polar 웹훅으로 갱신된 `profiles.plan` · 클라이언트 plan 불신 · RLS user-scoped 접근 · service-role은 Polar 웹훅에만)
- `/docs/ARCHITECTURE.md` ("데이터 모델" 절 — `profiles`: `id`(=auth uid)·`plan`('free'|'pro', 진실 원천)·`polar_subscription_id`·`polar_customer_id`)
- `/docs/ADR.md` (ADR-007 plan은 웹훅으로만 갱신, ADR-002 RLS)
- `/src/services/mock/profile.ts` (mock 구현 `getMockProfile` — 반환 타입·행위 계약. live는 **완전히 동일한 반환 타입**이어야 한다)
- `/src/services/index.ts` (`getProfileService` 팩토리 — 여기에 live 분기를 추가한다)
- `/src/types/plan.ts` (`Plan`), 프로필 타입 정의(`Profile`)
- Step 0 산출물: `/src/services/live/transactions.ts` (live 서비스 배치·`server-only`·매핑 패턴 참고)
- `1-supabase` 산출물: `/src/lib/supabase/server-client.ts` (user-scoped 클라이언트), `/src/types/database.ts`

이전 코드를 꼼꼼히 읽고 plan 진실 원천 규칙을 이해한 뒤 작업하라.

## 배경

phase 3는 mock을 유지한 채 live 구현만 추가한다(컷오버는 6-launch). 이 step은 `profiles` 테이블을 **읽기 전용**으로 조회하는 live 서비스를 만든다. plan 게이팅(Pro 리포트 등)은 이 서비스가 반환하는 서버측 `plan`을 신뢰한다. **plan 쓰기/갱신은 여기서 하지 않는다** — 그것은 `5-payment`의 Polar 웹훅이 유일한 원천이다.

## 작업

**TDD 필수** — Supabase 클라이언트를 목킹한 단위 테스트를 먼저 작성한다. 실네트워크 금지.

1. **profile live 서비스** — `src/services/live/profile.ts`
   - `import 'server-only'`. 서버 전용.
   - mock(`getMockProfile`)과 **완전히 동일한 반환 타입**(`Profile`)을 지키는 읽기 함수:
     ```ts
     async function getProfile(userId: string): Promise<Profile>
     ```
   - user-scoped 클라이언트(`server-client.ts`)로 `profiles`를 `id = userId`로 조회한다(RLS로 자기 행만 접근). DB 행(`snake_case`)을 `Profile`(`camelCase`) 도메인 타입으로 매핑한다(`plan`·`polar_subscription_id`→`polarSubscriptionId`·`polar_customer_id`→`polarCustomerId` 등).
   - 행이 없을 때의 동작(예: 신규 유저 기본 `plan='free'` 반환 또는 명확한 에러)을 mock 계약과 정합하게 정한다. **어떤 경우에도 클라이언트 입력으로 plan을 결정하지 않는다.**

2. **핵심 규칙 (CRITICAL)**
   - **읽기 전용.** 이 서비스는 `profiles`를 조회만 한다. `plan`(또는 polar 필드)을 **쓰지/갱신하지 마라.** plan의 유일한 진실 원천은 5-payment의 Polar 웹훅으로 갱신된 `profiles.plan`이다. 이유: CLAUDE.md·ADR-007 — 셀프 업그레이드 차단.
   - **user-scoped 클라이언트만** 사용(RLS로 자기 프로필만). service-role 미사용. 이유: service-role은 Polar 웹훅 plan 갱신 전용.

3. **팩토리 live 분기 추가** — `src/services/index.ts`
   - `getProfileService()`가 `getDataSource() === 'live'`일 때 live `getProfile`을 반환하도록 분기 추가.
   - CRITICAL: mock 반환 타입과 완전히 동일해야 한다(ADR-008). 다른 팩토리(`llm`)와 `DATA_SOURCE` 기본값은 건드리지 마라.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(Supabase 클라이언트 목킹, 실네트워크 없음):
  - `getProfile`이 `profiles`를 `id = userId`로 조회하고 DB 행을 `Profile` 도메인 타입으로 매핑해 반환한다.
  - 반환 형태가 mock `getMockProfile`과 동일한 `Profile`이다.
  - 서비스가 어떤 write/update/upsert도 `profiles`에 하지 않음을 검증(목킹된 클라이언트의 mutation 미호출).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 서비스가 **읽기 전용**인가(plan/polar 필드 write 없음)?
   - user-scoped 클라이언트(RLS) 경유인가? service-role 미사용인가?
   - live/mock 반환 타입이 완전히 동일한가?
   - `getProfileService`만 live 분기가 추가되고 다른 팩토리·`DATA_SOURCE` 기본값은 불변인가?
3. 결과에 따라 `phases/3-data-live/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "live profile 읽기 서비스·매핑·팩토리 분기 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- 이 서비스에서 `profiles.plan`(또는 polar 필드)을 write/update/upsert 하지 마라. 이유: CLAUDE.md·ADR-007 — plan의 유일한 진실 원천은 5-payment의 Polar 웹훅이다.
- 클라이언트가 보낸 plan 값으로 반환 plan을 결정하지 마라. 이유: 셀프 업그레이드 차단.
- service-role 클라이언트로 접근하지 마라. 이유: RLS 우회 — service-role은 Polar 웹훅 plan 갱신 전용.
- 다른 팩토리(`llm`)의 live 분기나 `DATA_SOURCE` 기본값을 바꾸지 마라. 이유: 이후 phase scope이며 컷오버는 6-launch.
- mock profile 서비스를 수정하지 마라. 이유: mock 동작은 phase 내내 유지된다.
- 실제 Supabase 네트워크 호출을 테스트에 넣지 마라. 이유: 클라이언트 목킹 단위 테스트로 검증한다.
- 기존 테스트를 깨뜨리지 마라.
