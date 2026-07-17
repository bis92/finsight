# Step 0: oauth-callback

## 읽어야 할 파일

먼저 아래 파일들을 읽고 인증 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 외부 API 호출은 서버에서만 · 시크릿 서버 전용 · 5xx 일반화)
- `/docs/ARCHITECTURE.md` (§ 보안 "서버 라우트는 사용자 JWT 컨텍스트로 접근" · § 환경변수 "인증: 카카오·구글 OAuth provider는 Supabase Auth 대시보드에서 설정. 카카오는 커스텀 OIDC")
- `/docs/ADR.md` (ADR-002 Supabase Auth · 카카오 + 구글 OAuth · 카카오는 Supabase 기본 provider 아님 → 커스텀 OIDC)
- `/docs/PRD.md` (핵심기능 5: 인증 카카오 + 구글 OAuth, 이메일/비밀번호 없음)
- 1-supabase Step 3 산출물: `src/lib/supabase/server-client.ts` (user-scoped `@supabase/ssr` 클라이언트 — 이 콜백이 쿠키에 세션을 심을 때 재사용한다)
- 1-supabase Step 0 산출물: `src/lib/env.ts` (`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY` 읽기)
- 0-mvp: `src/app/login/page.tsx`·`src/app/login/LoginClient.tsx` (현재 스텁 로그인 UI — Step 1에서 실 OAuth로 배선, 이 step은 콜백만)

이 step은 **2-auth의 토대**다. OAuth 브라우저 리다이렉트가 돌아오는 서버 콜백을 만든다. 로그인 UI 배선(`signInWithOAuth` 호출)과 보호 라우트는 Step 1의 scope이다.

## 작업

`src/app/auth/callback/route.ts` — OAuth authorization code를 Supabase 세션으로 교환하는 **서버 Route Handler(GET)**. provider-agnostic으로 작성한다(카카오·구글 공통 경로).

1. **콜백 핸들러 시그니처**
   ```ts
   // src/app/auth/callback/route.ts
   export async function GET(request: Request): Promise<Response>
   ```
   - 쿼리스트링에서 `code`(authorization code)와 선택적 `next`(로그인 후 이동 경로) · `error`/`error_description`을 읽는다.
   - `code`가 있으면 1-supabase의 user-scoped `@supabase/ssr` 서버 클라이언트로 `supabase.auth.exchangeCodeForSession(code)`를 호출해 **세션 쿠키를 심는다**. 성공 시 `next`(기본 `/upload`)로 리다이렉트.
   - provider가 리다이렉트에 실려온 `error`(예: 사용자 취소)면 `/login`으로 리다이렉트하되 오류 힌트를 쿼리로 전달(사용자에게는 일반 문구, 내부 원문은 서버 로그).
   - `code`가 없거나 교환 실패면 `/login`으로 리다이렉트(로그인 실패 처리). 스택·SDK 원문을 사용자 URL/응답에 노출하지 마라 → `console.error`로만.

2. **provider-agnostic** — 카카오/구글을 분기하지 마라. OAuth authorization-code 흐름은 provider에 무관하게 동일한 `code → session` 교환이다. 카카오는 Supabase 기본 provider가 아니라 커스텀 OIDC로 등록되지만(ADR-002), 콜백 코드 자체는 provider 이름을 알 필요가 없다.

3. **오픈 리다이렉트 방어** — `next` 파라미터는 **앱 내부 상대 경로(`/`로 시작, `//` 아님)만** 허용한다. 외부 절대 URL(`https://…`, `//evil.com`)로의 리다이렉트를 막아라. 유효하지 않으면 기본 `/upload`.

4. **핵심 보안 규칙 (명시)**
   - CRITICAL: 모든 인증 처리(코드 교환·세션 쿠키 세팅)는 **서버 Route Handler에서만**. 클라이언트에서 `exchangeCodeForSession`을 부르지 마라. 이유: CLAUDE.md — 외부 API 호출·세션 시크릿은 서버 전용.
   - CRITICAL: 세션 쿠키는 `httpOnly`로 심는다(`@supabase/ssr` 서버 클라이언트가 담당). anon 키 외 시크릿(`SUPABASE_SERVICE_ROLE_KEY`)을 이 경로에서 쓰지 마라 — 콜백은 user-scoped anon 클라이언트로만. 이유: service-role은 Polar 웹훅 plan 갱신 전용(CLAUDE.md).
   - 내부 예외를 사용자에게 노출하지 마라(5xx 일반화). 로그인 실패는 `/login` 리다이렉트로 일반화.

5. **blocked 안내 (작업 범위 명시)** — 실제 카카오/구글 OAuth 앱 등록, Supabase 대시보드의 provider(구글 활성화·카카오 커스텀 OIDC) 설정, 리다이렉트 URL 등록은 **사용자 개입이 필요한 실 프로비저닝**이며 6-launch(env-secrets)에서 다룬다. **이 step은 콜백 코드만 구현**하고 실 프로비저닝은 범위 밖이다. 테스트는 실제 OAuth 네트워크가 아니라 `@supabase/ssr` 클라이언트를 목킹한 단위테스트(코드 있음/없음/error/오픈 리다이렉트 방어)로 검증한다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(SDK 목킹 단위테스트, 실네트워크 금지):
  - `code`가 있을 때 `exchangeCodeForSession`이 호출되고 성공 시 `next`(기본 `/upload`)로 리다이렉트.
  - provider `error`가 실려오면 `/login`으로 리다이렉트하고 내부 원문을 응답에 노출하지 않는다.
  - `code`가 없거나 교환 실패면 `/login`으로 리다이렉트.
  - `next`가 외부 절대 URL/`//`이면 무시하고 기본 경로(오픈 리다이렉트 방어).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 코드 교환·세션 쿠키 세팅이 서버 Route Handler에서만 일어나는가(클라이언트 호출 없음)?
   - user-scoped anon 클라이언트만 쓰는가(service-role·시크릿 미사용)?
   - provider-agnostic인가(카카오/구글 분기 없음)?
   - 오픈 리다이렉트 방어(내부 상대 경로만)가 있는가?
   - 로그인 실패 시 내부 예외를 사용자에게 노출하지 않고 `/login`으로 일반화하는가?
3. 결과에 따라 `phases/2-auth/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "콜백 산출물 한 줄 요약(경로·provider-agnostic 교환·오픈 리다이렉트 방어 포함)"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요(실 OAuth 프로비저닝 없이 진행 불가 등) → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- 클라이언트 컴포넌트에서 `exchangeCodeForSession`·코드 교환을 호출하지 마라. 이유: CLAUDE.md — 인증·외부 API는 서버 전용.
- provider별(카카오/구글)로 콜백을 분기·중복 구현하지 마라. 이유: authorization-code 흐름은 provider-agnostic(ADR-002)이며 분기는 유지보수 부담.
- `next` 파라미터를 검증 없이 리다이렉트에 쓰지 마라. 이유: 오픈 리다이렉트 취약점.
- `SUPABASE_SERVICE_ROLE_KEY` 등 시크릿을 이 경로에서 쓰지 마라. 이유: service-role은 Polar 웹훅 전용, 콜백은 anon user-scoped(CLAUDE.md).
- 실제 카카오/구글 OAuth 앱·Supabase provider를 이 step에서 프로비저닝하려 하지 마라(코드만). 이유: 사용자 개입 필요, 6-launch env-secrets scope.
- SDK/스택 원문을 사용자 응답·URL에 노출하지 마라. 이유: CLAUDE.md 5xx 일반화.
- 기존 테스트를 깨뜨리지 마라.
