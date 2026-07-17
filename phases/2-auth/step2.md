# Step 2: profile-provisioning

## 읽어야 할 파일

먼저 아래 파일들을 읽고 인증·데이터 모델 설계를 파악하라:

- `/CLAUDE.md` (CRITICAL: plan 진실 원천은 Polar 웹훅으로 갱신된 `profiles.plan` · service-role은 웹훅 전용 · RLS user-scoped)
- `/docs/ARCHITECTURE.md` (§ 데이터 모델 `profiles` 테이블: `id`(=auth uid), `plan`('free'|'pro'), `polar_subscription_id`, `polar_customer_id`)
- `/docs/ADR.md` (ADR-002 RLS `user_id = auth.uid()`, ADR-006 Free/Pro plan 기본 free)
- 1-supabase Step 1 산출물: `supabase/migrations/0001_schema.sql` (`profiles` 등 테이블 정의)
- 1-supabase Step 2 산출물: `supabase/migrations/0002_rls.sql` (RLS 정책)
- 2-auth Step 0 산출물: `src/app/auth/callback/route.ts` (최초 로그인이 통과하는 콜백)

이 step은 마이그레이션(SQL)만 다룬다. 최초 로그인 시 `profiles` row가 자동 생성되도록 한다.

## 작업

`supabase/migrations/0003_profile_trigger.sql` — `auth.users`에 새 유저가 insert될 때 `profiles` row를 **자동 생성**하는 Postgres 트리거.

1. **트리거 + 함수**
   - `auth.users`의 `AFTER INSERT` 트리거로 `public.profiles`에 `(id = NEW.id, plan = 'free')` row를 삽입하는 `SECURITY DEFINER` 함수를 만든다.
   - CRITICAL: `plan` 기본값은 **`'free'`**. 이후 `plan`은 오직 Polar 웹훅(service-role)으로만 갱신된다 — 트리거는 초기 free row 생성만 담당한다. 이유: CLAUDE.md — plan 진실 원천은 Polar 웹훅.
   - 멱등성: 재실행·중복 insert에 안전하도록 `ON CONFLICT (id) DO NOTHING`. `polar_subscription_id`·`polar_customer_id`는 초기 `NULL`.
   - `SECURITY DEFINER` 함수의 `search_path`를 고정(`SET search_path = public`)해 검색경로 하이재킹을 방어한다.

2. **트리거 vs 콜백 upsert (결정)**
   - 기본은 **DB 트리거**(`auth.users` insert → profiles 생성). 이유: 인증 경로(콜백·다른 로그인 흐름)에 무관하게 DB 레벨에서 단일 보장.
   - 만약 1-supabase의 RLS/권한 제약으로 `auth.users` 트리거가 이 프로젝트에서 불가하다면, **대안으로 Step 0 콜백에서 최초 로그인 시 `profiles` upsert**(`plan='free'`, `ON CONFLICT DO NOTHING`)를 하도록 이 step에서 명시하라. 어느 쪽이든 결과 불변식은 동일: 최초 로그인 후 유저는 정확히 하나의 `plan='free'` profiles row를 갖는다.
   - 대안(콜백 upsert)을 택할 경우에도 plan은 반드시 `'free'`로만 세팅하고 절대 클라이언트 값으로 세팅하지 마라.

3. **마이그레이션 규율**
   - `0001`·`0002` 마이그레이션을 수정하지 말고 새 `0003_profile_trigger.sql`로 추가한다(순번 유지).
   - `profiles` 스키마·컬럼명은 1-supabase Step 1의 정의를 그대로 참조한다(재정의 금지).

## Acceptance Criteria

```bash
npm run build
npm test
```

- SQL 마이그레이션이라 런타임 단위테스트가 어려우면, 최소 검증으로:
  - `0003_profile_trigger.sql`이 존재하고 `auth.users` AFTER INSERT 트리거 + `plan='free'` + `ON CONFLICT DO NOTHING` + `SECURITY DEFINER`/`search_path` 고정을 포함하는지 정적 검증(파일 파싱 테스트 또는 마이그레이션 lint) 1개.
  - 콜백 upsert 대안을 택했다면 `src/app/auth/callback/route.ts`가 최초 로그인 시 `plan='free'` upsert(중복 무해)를 수행하는지 목킹 단위테스트.
- `npm run build`·`npm test`가 통과(기존 테스트 불변)해야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 최초 로그인 시 `profiles` row가 자동 생성되고 `plan` 기본이 `'free'`인가?
   - 멱등(중복/재실행 안전, `ON CONFLICT DO NOTHING`)인가?
   - 트리거 함수가 `SECURITY DEFINER` + 고정 `search_path`로 안전한가?
   - plan을 클라이언트 값이 아닌 상수 `'free'`로만 세팅하는가(진실 원천 규칙)?
   - `0001`/`0002`를 건드리지 않고 `0003`로 추가했는가?
3. 결과에 따라 `phases/2-auth/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "profiles 자동 생성 트리거(plan=free·멱등·SECURITY DEFINER) 요약(또는 콜백 upsert 대안)"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요(마이그레이션 적용 권한 등) → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- `plan`을 클라이언트가 보낸 값으로 세팅하지 마라(트리거·upsert 모두 상수 `'free'`만). 이유: CLAUDE.md — plan 진실 원천은 Polar 웹훅, 셀프 업그레이드 차단.
- 트리거에서 `plan='pro'` 등 free 이외 값을 세팅하지 마라. 이유: 최초 유저는 무조건 free(ADR-006).
- `0001`·`0002` 마이그레이션을 수정하지 마라. 이유: 순번·재현성 유지, 1-supabase 산출물 불변.
- 멱등성 없이(중복 insert 시 실패하는) 트리거를 만들지 마라. 이유: 재로그인·재실행 시 에러.
- `SECURITY DEFINER` 함수에 `search_path`를 고정하지 않은 채 두지 마라. 이유: 검색경로 하이재킹 보안 취약점.
- 기존 테스트를 깨뜨리지 마라.
