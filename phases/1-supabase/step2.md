# Step 2: rls-policies

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (RLS `user_id = auth.uid()` · plan 진실 원천은 Polar 웹훅 갱신 `profiles.plan` · service-role은 웹훅 plan 갱신에만)
- `/docs/ARCHITECTURE.md` ("보안" 절 — 모든 테이블 RLS · service-role 용도 제한)
- `/docs/ADR.md` (ADR-002 RLS 크로스테넌트 격리, ADR-007 셀프 업그레이드 차단·plan 진실 원천, ADR-009)
- Step 1 산출물: `supabase/migrations/0001_schema.sql` (테이블·컬럼 이름 확인 — 정책이 이 스키마를 정확히 참조해야 함)

이전 코드를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라. 정책은 Step 1 스키마의 테이블·컬럼명과 정확히 맞아야 한다.

## 작업

`supabase/migrations/0002_rls.sql`을 작성한다. Step 1에서 만든 5개 테이블 전부에 RLS를 켜고 유저 스코프 정책을 정의한다.

1. **RLS enable** — 모든 테이블에 `alter table <t> enable row level security`.
   - `profiles`, `uploads`, `transactions`, `analyses`, `subscriptions`.
   - CRITICAL: RLS를 켜면 기본이 deny다. 정책 없는 테이블은 유저가 아무 것도 못 읽으니, 아래 정책을 빠짐없이 정의한다. 이유: ADR-002 — 크로스테넌트 격리를 DB 레벨에서 강제.

2. **user_id 스코프 테이블** — `uploads`·`transactions`·`analyses`·`subscriptions`
   - 각 테이블에 `select`·`insert`·`update`·`delete` 정책을 만들되, 조건은 모두 `user_id = auth.uid()`.
     - `select`/`update`/`delete`는 `using (user_id = auth.uid())`.
     - `insert`는 `with check (user_id = auth.uid())` (다른 유저의 user_id로 삽입 차단).
   - CRITICAL: 유저는 자기 행(`user_id = auth.uid()`)만 접근 가능하다. 이유: 개인 금융 PII — 크로스테넌트 유출 방지.

3. **`profiles` 테이블** (조건이 `id = auth.uid()`)
   - `select`: `using (id = auth.uid())` — 자기 프로필만 조회.
   - `insert`: `with check (id = auth.uid())` — 자기 프로필만 생성(가입 시).
   - `update`: CRITICAL — 일반 유저의 `profiles` UPDATE는 **`plan`을 바꿀 수 없어야 한다**. `plan`은 오직 service-role(Polar 웹훅)만 갱신한다. 아래 중 하나로 강제한다:
     - (권장) 유저용 UPDATE 정책을 아예 두지 않는다(유저는 `plan`·`polar_*`를 바꿀 필요가 없으므로 UPDATE 권한을 주지 않는다). service-role 클라이언트는 RLS를 우회하므로 웹훅 갱신은 그대로 동작한다.
     - 또는 유저 UPDATE를 허용하되 `plan`·`polar_subscription_id`·`polar_customer_id` 컬럼을 유저가 변경하지 못하도록 컬럼 권한/트리거로 막는다(단순함 우선이면 위 권장안 채택).
   - CRITICAL: 클라이언트가 보낸 plan 값으로 기능을 해제하지 못하게, plan의 유일한 진실 원천은 웹훅으로 갱신된 `profiles.plan`이다. 이유: CLAUDE.md CRITICAL · ADR-007 — 셀프 업그레이드 차단.

주석으로 각 정책 블록에 의도(예: `-- user-scoped: own rows only`, `-- plan is server-truth: no user UPDATE`)를 남긴다. service-role 클라이언트는 RLS를 우회(bypass)하므로 이 파일에 service-role용 별도 정책을 만들 필요는 없다 — 웹훅 plan 갱신은 Step 3의 service-role 클라이언트가 수행한다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 이 step은 SQL 산출물이므로 앱 빌드/테스트는 회귀 방지용이다. 추가로 `supabase/migrations/0002_rls.sql`이 존재하고, (a) 5개 테이블 모두 `enable row level security`가 있으며, (b) `profiles`에 유저가 `plan`을 갱신할 수 있는 UPDATE 정책이 **없는지**를 육안/그렙으로 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 5개 테이블 모두 RLS enable 됐는가?
   - user_id 스코프 테이블 정책이 `user_id = auth.uid()`(insert는 `with check`)인가?
   - `profiles` 정책이 `id = auth.uid()`인가?
   - 일반 유저가 `profiles.plan`을 UPDATE할 경로가 없는가(셀프 업그레이드 차단)?
3. 결과에 따라 `phases/1-supabase/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "RLS enable·테이블별 정책·plan 갱신 차단 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- 일반 유저가 `profiles.plan`(또는 `polar_*`)을 갱신할 수 있는 정책을 열지 마라. 이유: ADR-007 · CLAUDE.md CRITICAL — 셀프 업그레이드 차단, plan 진실 원천은 웹훅.
- 어떤 테이블에서든 `user_id`/`id` 스코프 없이 전체 행을 열어주는 정책(`using (true)` 등)을 만들지 마라. 이유: 크로스테넌트 PII 유출.
- RLS enable을 빠뜨린 테이블을 남기지 마라. 이유: 정책만 있고 RLS off면 격리가 무력화된다.
- Step 1의 `0001_schema.sql`을 수정하지 마라(정책은 별도 파일). 이유: 마이그레이션 순서·재현성.
- 기존 테스트를 깨뜨리지 마라.
