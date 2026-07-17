# Step 1: session-middleware

## 읽어야 할 파일

먼저 아래 파일들을 읽고 인증 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 인증·외부 API는 서버 · 시크릿 서버 전용 · mock 경로 유지 · 게이팅 진실 원천)
- `/docs/ARCHITECTURE.md` (§ 보안 "서버 라우트는 사용자 JWT 컨텍스트로 접근" · mock-first 시임 `DATA_SOURCE`)
- `/docs/ADR.md` (ADR-002 카카오+구글 OAuth, ADR-008 mock-first env 가드)
- 2-auth Step 0 산출물: `src/app/auth/callback/route.ts` (OAuth 콜백 — 로그인 성공 후 세션 쿠키가 심겨 있음)
- 1-supabase Step 3 산출물: `src/lib/supabase/server-client.ts` (user-scoped `@supabase/ssr` 서버 클라이언트)
- `src/app/api/_lib/server.ts` (현재 `CURRENT_USER_ID = 'mock-free-user'` 하드코딩 — live에서 실제 세션 유저로 대체할 경로를 마련)
- `src/app/login/page.tsx`·`src/app/login/LoginClient.tsx` (현재 스텁 `/api/auth/stub` 호출 — live에서 `signInWithOAuth`로 배선)

이 step은 Step 0의 콜백을 전제로 **세션 헬퍼·보호 라우트·로그인 UI 배선**을 만든다.

## 작업

세 가지를 만든다: (1) 서버 세션 헬퍼, (2) 보호 라우트 미들웨어, (3) 로그인 UI 실 OAuth 배선. mock 경로는 유지한다.

1. **`src/lib/auth/session.ts` — 서버 세션 헬퍼**
   ```ts
   export async function getAuthenticatedUserId(): Promise<string | null>
   ```
   - 요청 쿠키에서 Supabase 세션을 읽어(user-scoped `@supabase/ssr` 서버 클라이언트 `supabase.auth.getUser()`) 인증된 유저의 `id`를 반환. **미인증이면 `null`**(throw 금지).
   - CRITICAL: 서버 전용. 라우트는 이 헬퍼가 돌려준 유저의 JWT 컨텍스트로 데이터에 접근한다(RLS `user_id = auth.uid()`). 클라이언트에서 부르지 마라.

2. **`src/app/api/_lib/server.ts` — `CURRENT_USER_ID` 대체 경로 마련 (mock 유지)**
   - 기존 `CURRENT_USER_ID = 'mock-free-user'` 상수를 **함수로 전환**하되 mock 경로는 불변으로 유지한다. 시그니처 예:
     ```ts
     export async function resolveCurrentUserId(): Promise<string>
     // DATA_SOURCE==='mock' → 'mock-free-user'(기존 값 그대로)
     // DATA_SOURCE==='live' → getAuthenticatedUserId(); null이면 401(ApiRouteError)
     ```
   - CRITICAL: `DATA_SOURCE=mock`에서의 반환값·동작은 기존과 완전히 동일해야 한다(기존 API·대시보드·게스트 데모 테스트 불변). 이유: CLAUDE.md — mock 경로 유지, phase 1~5는 mock 유지한 채 live만 추가.
   - live에서 미인증 API 접근은 401로 처리(미들웨어와 별개로 API 레벨 방어). 내부 예외를 노출하지 마라.
   - 기존 라우트들이 `CURRENT_USER_ID`를 import하던 곳을 이 함수로 옮기되, 반환 타입·값이 mock에서 동일하므로 라우트 로직·응답은 불변이어야 한다.

3. **`src/middleware.ts` — 보호 라우트**
   - `/dashboard`·`/upload`·`/pro` (및 하위 경로)를 보호한다. 미인증 접근 → `/login`으로 리다이렉트(원래 목적지를 `next`로 전달해 로그인 후 복귀).
   - `config.matcher`로 보호 대상만 지정한다. 공개 경로(`/`, `/login`, `/auth/callback`, `/api/*` 정적 에셋 등)는 제외.
   - CRITICAL: 게스트 데모(`/dashboard?guest=1`)는 **읽기전용 fixture 경로로 미인증 허용**을 유지해야 한다(0-mvp Step 10 규약) — `guest=1`이면 리다이렉트하지 마라. 이유: Activation(가입 없이 3분 내 첫 대시보드).
   - mock(`DATA_SOURCE=mock`)에서는 스텁 세션(`finsight_stub_session` 쿠키)도 인증으로 인정해 기존 스텁 로그인 흐름을 깨지 않는다. live에서는 Supabase 세션만 인정.

4. **로그인 UI 실 OAuth 배선 (`src/app/login/LoginClient.tsx`)**
   - live에서 카카오/구글 버튼이 Supabase `signInWithOAuth({ provider })`(kakao/google)로 브라우저 OAuth를 시작하고, `redirectTo`를 `/auth/callback`(Step 0)로 지정하게 한다.
   - mock에서는 기존 `/api/auth/stub` 스텁 경로를 그대로 유지(분기). 이유: mock-first — live만 추가, mock 흐름 불변.
   - `signInWithOAuth`는 브라우저 리다이렉트를 시작하는 클라이언트 호출이며 anon 키만 사용 → 시크릿 노출 아님. 그러나 세션 교환은 서버 콜백(Step 0)에서 일어난다는 경계를 유지하라.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(SDK 목킹 단위테스트):
  - `getAuthenticatedUserId`가 세션 있으면 유저 id, 없으면 `null`.
  - `resolveCurrentUserId`가 mock에서 기존 `'mock-free-user'`를 그대로 반환(기존 동작 불변), live 미인증에서 401.
  - middleware가 미인증 `/dashboard`·`/upload`·`/pro`를 `/login`으로 리다이렉트하고, `/dashboard?guest=1`은 통과시킨다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `getAuthenticatedUserId`가 서버 전용·미인증 시 null인가?
   - `resolveCurrentUserId`가 mock에서 기존 값·동작을 완전히 보존하는가(기존 테스트 불변)?
   - 보호 라우트(`/dashboard`·`/upload`·`/pro`) 미인증이 `/login`으로, 게스트 데모는 통과하는가?
   - 라우트가 유저 JWT 컨텍스트로 접근하는가(service-role 미사용)?
   - 로그인 UI가 live=`signInWithOAuth`, mock=스텁으로 분기하며 mock 흐름을 깨지 않는가?
3. 결과에 따라 `phases/2-auth/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "세션 헬퍼·보호 미들웨어·resolveCurrentUserId·로그인 OAuth 배선 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- mock 경로의 반환값·동작을 바꾸지 마라(`resolveCurrentUserId`는 mock에서 기존 `'mock-free-user'` 그대로). 이유: CLAUDE.md — phase 1~5는 mock 유지, UI/기존 테스트 불변.
- 게스트 데모(`/dashboard?guest=1`) 미인증 읽기전용 접근을 미들웨어로 막지 마라. 이유: 0-mvp Step 10 규약·Activation.
- `getAuthenticatedUserId`를 클라이언트에서 호출하지 마라. 이유: 서버 세션·JWT 컨텍스트는 서버 전용.
- 라우트에서 service-role 클라이언트로 유저 데이터에 접근하지 마라(RLS user-scoped만). 이유: CLAUDE.md — service-role은 Polar 웹훅 전용.
- 클라이언트가 보낸 유저 id/plan을 신뢰해 접근을 허용하지 마라. 이유: 진실 원천은 세션·`profiles`(CLAUDE.md).
- 미인증 API 접근에서 내부 예외를 노출하지 마라(401 일반화). 이유: 5xx/에러 일반화 규칙.
- 기존 테스트를 깨뜨리지 마라.
