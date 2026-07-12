# Step 0: project-setup

## 읽어야 할 파일
먼저 아래를 읽고 아키텍처·설계 의도를 파악하라:
- `/CLAUDE.md` (기술 스택, CRITICAL 규칙, 명령어)
- `/docs/ARCHITECTURE.md` (디렉토리 구조, 개발 단계, 시임)
- `/docs/ADR.md` (기술 선택 배경)

## 작업
Next.js 15 (App Router) + TypeScript(strict) + Tailwind CSS + Vitest 프로젝트를 스캐폴딩한다. **이후 모든 step은 격리된 세션에서 실행되고, 세션 종료 시 `npm run lint && npm run build && npm run test`가 자동 실행된다. 따라서 이 step이 끝나면 세 커맨드가 반드시 통과해야 한다.**

1. `package.json` — scripts: `dev`(next dev), `build`(next build), `lint`(next lint 또는 eslint), `test`(`vitest run`, watch 아님).
2. 설정: `tsconfig.json`(strict: true, path alias `@/*` → `src/*`), `next.config.*`, `tailwind.config.*`, `postcss.config.*`, `.eslintrc*`, `vitest.config.*`(environment: 'jsdom', alias `@/*`).
3. 테스트 인프라: `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` 설치. `vitest.setup.ts`에서 jest-dom 매처 등록. (이후 step들의 컴포넌트 렌더 테스트가 돌아가야 함)
4. 폴더 골격 생성: `src/app`, `src/components`, `src/queries`, `src/services`, `src/lib`, `src/types`. 빈 폴더는 `.gitkeep`로 유지.
5. 최소 앱: `src/app/layout.tsx`, `src/app/page.tsx`(빌드 통과용 최소 마크업), `src/app/globals.css`(Tailwind 지시어).
6. 통과하는 테스트 1개: `src/lib/__tests__/smoke.test.ts` — 자명한 단언(`expect(1+1).toBe(2)`)으로 `npm test`가 성공하게.
7. `.env.example` 생성: `DATA_SOURCE=mock`, `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`, `SUPABASE_SERVICE_ROLE_KEY=`, `ANTHROPIC_API_KEY=`, `POLAR_ACCESS_TOKEN=`, `POLAR_WEBHOOK_SECRET=` (값은 비움).
8. `.gitignore`에 `.env*`(단 `.env.example` 제외), `node_modules`, `.next` 포함 확인.

## Acceptance Criteria
```bash
npm install
npm run lint
npm run build
npm run test
```
세 커맨드가 모두 에러 없이 통과.

## 검증 절차
1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `/docs/ARCHITECTURE.md`의 디렉토리 구조(`src/app|components|queries|services|lib|types`)를 따르는가?
   - `tsconfig` strict, path alias `@/*`가 설정됐는가?
   - `.env.example`에 시크릿 값이 비어 있는가(실제 키 하드코딩 금지)?
3. `phases/0-mvp-ui/index.json`의 step 0을 업데이트:
   - 성공 → `"status": "completed"`, `"summary"`에 산출물 한 줄 요약(스택·주요 설정 파일·테스트 인프라).
   - 3회 시도 후 실패 → `"status": "error"`, `"error_message"`.

## 금지사항
- Supabase/Polar/Anthropic SDK로 **실제 외부 연동을 하지 마라.** 이유: 이 단계는 mock-first 부트스트랩이며 키가 없다. 패키지 설치는 아직 하지 않는다(phase 1에서).
- `.env.example`에 실제 키 값을 넣지 마라. 이유: 시크릿 유출.
- 최소 범위를 넘는 페이지·컴포넌트·기능을 만들지 마라. 이유: 이 step은 스캐폴딩만.
