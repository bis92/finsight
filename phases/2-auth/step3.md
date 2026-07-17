# Step 3: stub-auth-retirement

## 읽어야 할 파일

먼저 아래 파일들을 읽고 스텁 인증·세션 구조를 파악하라:

- `/CLAUDE.md` (CRITICAL: mock·스텁 인증은 live에 새지 않게 env 가드 · 인증은 서버 · 게이팅 진실 원천)
- `/docs/ADR.md` (ADR-008 mock-first — 스텁 인증이 공개/prod에 노출되면 안 됨, `DATA_SOURCE` 기준 fail-closed)
- `/docs/ARCHITECTURE.md` (§ 핵심 원칙 mock-first 시임 · 게스트 데모 fixture)
- `src/services/stub-auth.ts` (`canUseStubAuth(dataSource)` — 이미 `DATA_SOURCE` 가드)
- `src/app/api/auth/stub/route.ts` (스텁 로그인 POST — live에서 403 반환)
- `src/app/api/_lib/server.ts` (2-auth Step 1에서 도입한 `resolveCurrentUserId`)
- 2-auth Step 1 산출물: `src/lib/auth/session.ts`·`src/middleware.ts`·로그인 UI 배선
- 0-mvp Step 10: 게스트 데모(`/dashboard?guest=1`) fixture 읽기전용 경로

이 step은 새 파일을 만들기보다 **스텁 인증이 live에서 fail-closed로 유지되는지 확인**하고, live 로그인 경로를 기본으로 정착시킨다.

## 작업

1. **스텁 인증 fail-closed 확인·강화**
   - `src/services/stub-auth.ts`의 `canUseStubAuth`가 `dataSource === 'mock'`에서만 true임을 확인한다(이미 그러함).
   - `src/app/api/auth/stub/route.ts`가 live(`DATA_SOURCE=live`)에서 **403**을 반환함을 확인한다(이미 그러함). 확인만으로 부족하면 회귀 테스트를 보강한다.
   - CRITICAL: live에서 스텁 로그인은 **403 fail-closed**. 스텁 세션 쿠키(`finsight_stub_session`)가 live에서 인증으로 인정되지 않아야 한다 — Step 1 `resolveCurrentUserId`/`middleware`가 live에서 스텁 쿠키를 무시하고 Supabase 세션만 인정하는지 확인한다. 이유: ADR-008 fail-closed, 스텁 인증이 prod에 노출되면 안 됨.

2. **live 로그인 경로를 기본으로**
   - live에서 로그인 UI는 Step 1에서 배선한 `signInWithOAuth`(카카오/구글) → `/auth/callback`(Step 0) → 세션 → 보호 라우트 흐름이 기본 경로다. 스텁 경로는 mock 전용 폴백으로만 남는다.
   - `src/app/api/_lib/server.ts`의 `resolveCurrentUserId`가 **live에선 실제 세션 유저(`getAuthenticatedUserId`)**로 연결되는지 최종 확인한다(Step 1 산출물). mock에선 여전히 `'mock-free-user'`.

3. **게스트 데모(fixture 읽기전용) 유지**
   - CRITICAL: 게스트 데모 경로(`/dashboard?guest=1`, fixture 읽기전용)는 mock/live 무관하게 **깨지지 않게 유지**한다. 게스트는 인증 없이 fixture만 읽고 mutation은 비활성. 스텁 인증 정리가 게스트 경로를 건드리지 않도록 한다.
   - 게스트 데모는 스텁 로그인과 별개 경로임을 명확히 하라 — 스텁 로그인은 live에서 막히지만, 게스트 읽기전용 데모는 유지된다.

4. **정리 범위 명시**
   - 이 step은 스텁 인증을 **삭제하지 않는다**(mock 개발/데모에 여전히 필요). live에서 fail-closed로 격리하고 live 실 로그인을 기본으로 만드는 것이 목표다. 스텁 관련 mock 테스트는 유지.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소:
  - `canUseStubAuth('live') === false`, `canUseStubAuth('mock') === true`.
  - `/api/auth/stub` POST가 live에서 403(스텁 fail-closed) — 회귀 테스트로 고정.
  - live에서 스텁 세션 쿠키가 인증으로 인정되지 않는다(미들웨어/`resolveCurrentUserId` 관점, 목킹).
  - 게스트 데모(`/dashboard?guest=1`) 읽기전용 fixture 경로가 유지된다(0-mvp 게스트 테스트 불변).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - live에서 스텁 로그인이 403 fail-closed인가?
   - live에서 스텁 세션 쿠키가 인증으로 인정되지 않고 Supabase 세션만 인정되는가?
   - `resolveCurrentUserId`가 live=실제 세션 유저, mock=`'mock-free-user'`인가?
   - 게스트 데모 fixture 읽기전용 경로가 깨지지 않았는가(0-mvp 테스트 불변)?
   - 스텁 인증을 삭제하지 않고 격리했는가(mock 유지)?
3. 결과에 따라 `phases/2-auth/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "스텁 인증 live fail-closed 확인·live 로그인 기본화·게스트 데모 유지 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 게스트 데모(`/dashboard?guest=1`) fixture 읽기전용 경로를 깨지 마라. 이유: 0-mvp Step 10 규약·Activation, 스텁 로그인과 별개 경로.
- live에서 스텁 로그인·스텁 세션 쿠키를 인증으로 인정하지 마라. 이유: ADR-008 fail-closed, 스텁 인증 prod 노출 금지.
- 스텁 인증(`stub-auth.ts`·`/api/auth/stub`)을 삭제하지 마라. 이유: mock 개발/데모에 여전히 필요, live에선 env 가드로 격리하면 충분.
- mock 경로의 `resolveCurrentUserId` 반환값을 바꾸지 마라(`'mock-free-user'` 유지). 이유: CLAUDE.md — mock 흐름·기존 테스트 불변.
- 클라이언트가 보낸 유저/plan 값을 신뢰해 게이팅을 해제하지 마라. 이유: 진실 원천은 세션·`profiles.plan`.
- 기존 테스트를 깨뜨리지 마라.
