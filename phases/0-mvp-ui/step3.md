# Step 3: mock-auth

## 읽어야 할 파일
- `/docs/ARCHITECTURE.md` (레이어링, 스텁 인증이 prod에 새지 않게 가드)
- `/docs/UI_GUIDE.md` (폼 스타일)
- `/CLAUDE.md` (에러 메시지 규약)
- 이전 step 산출물: `src/components/ui/` 프리미티브, `src/types/`(Profile), `src/services/`(profiles)

## 작업
Supabase 없이 동작하는 **스텁 인증**과 로그인/가입 화면, 보호된 대시보드 라우트를 만든다. phase 1에서 이 뒤만 실제 Supabase Auth로 교체한다.

1. **스텁 세션** (`src/lib/auth/` 또는 `src/services/`): 개발용 로그인 상태를 표현(예: httpOnly 쿠키 또는 서버 세션 스텁). `signIn`/`signOut`/`getSession` 시그니처. **실제 비밀번호 검증·회원DB 없음** — 입력하면 로그인된 것으로 간주하는 스텁.
2. **화면** (`src/app/(auth)/`): `login/page.tsx`, `signup/page.tsx` — step1 `Input`/`Button` 재사용. 제출 시 스텁 세션 설정 후 `/dashboard`로 이동.
3. **보호 라우트**: `src/app/dashboard/layout.tsx`(또는 `middleware.ts`)에서 세션 없으면 `/login`으로 리다이렉트.
4. **가드**: 스텁 인증이 prod 빌드에서 활성화되지 않도록 env로 분기(예: `DATA_SOURCE=mock`일 때만 스텁 허용). 실제 인증 미구현 상태에서 prod가 무인증 통과되면 안 된다.
5. 세션 로직(`.ts`)에 테스트: `signIn` 후 `getSession`이 세션을 반환, `signOut` 후 null. (tdd-guard 대응)

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test
```

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 미로그인 상태에서 `/dashboard` 접근이 `/login`으로 리다이렉트되는가(로직상)?
   - 스텁 인증이 `DATA_SOURCE`/env로 가드되어 prod에 노출되지 않는가?
   - 폼이 `UI_GUIDE` 스타일과 프리미티브를 쓰는가?
3. `phases/0-mvp-ui/index.json`의 step 3 업데이트(completed+summary / error).

## 금지사항
- Supabase Auth SDK를 도입하지 마라. 이유: phase 1 대상. 지금은 스텁.
- 스텁 인증을 무조건 통과하도록(env 가드 없이) 두지 마라. 이유: phase 1 미완성 상태로 배포되면 인증 우회가 된다.
- 상태코드 기반 한글 에러 치환을 만들지 마라. 이유: 서버 message 그대로 노출 규약.
