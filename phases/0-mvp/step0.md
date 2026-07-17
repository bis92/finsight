# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (프로젝트 불변식 · CRITICAL 규칙)
- `/docs/ARCHITECTURE.md` (디렉토리 구조 · mock-first 시임 · 데이터 흐름)
- `/docs/ADR.md` (ADR-001 Next.js, ADR-008 mock-first)
- `/docs/PRD.md` (제품 개요)
- `/docs/DESIGN.md` (**디자인 토큰·폰트의 단일 참조** — 이 step에서 globals.css 변수 + Tailwind theme를 세팅한다)
- `/docs/design-reference/tokens/*.css` (토큰 원본: colors·radius·spacing·elevation·typography·fonts)

이 프로젝트는 아직 코드가 없다(빈 저장소, `package.json`·`src/` 없음). 이 step은 이후 모든 step의 토대가 되는 **프로젝트 부트스트랩**이다. 코드 로직은 만들지 않는다.

## 작업

Next.js 15 (App Router) + TypeScript(strict) + Tailwind CSS + Vitest 프로젝트를 이 저장소 루트에 초기화한다. 기존 `docs/`·`scripts/`·`phases/`·`CLAUDE.md`·`.env`·`.gitignore`는 보존한다.

1. **package.json 및 툴체인**
   - Next.js 15 (App Router), React 19, TypeScript strict mode.
   - Tailwind CSS 설정 (`tailwind.config.ts`, `postcss.config`, 전역 CSS). content 경로에 `src/**`.
   - Vitest 설정(`vitest.config.ts`). jsdom 환경(컴포넌트 테스트 대비), `@` alias = `src/`.
   - `package.json` scripts는 CLAUDE.md의 `## 명령어`와 정확히 일치시킨다:
     ```
     "dev":   "next dev",
     "build": "next build",
     "lint":  "next lint",
     "test":  "vitest run"
     ```
     (`test`는 반드시 CI 모드=`vitest run`. watch 금지 — execute.py가 비대화식으로 실행한다.)
   - ESLint (next/core-web-vitals + TypeScript).

2. **디렉토리 골격** (ARCHITECTURE.md 구조 그대로, 빈 폴더는 `.gitkeep`)
   ```
   src/
   ├── app/
   │   ├── layout.tsx        # 루트 레이아웃 (한국어 lang="ko", Light 서피스)
   │   ├── page.tsx          # 임시 플레이스홀더 (Step 10에서 교체)
   │   ├── globals.css
   │   └── providers.tsx     # react-query QueryClientProvider (client component)
   ├── components/
   ├── queries/
   ├── services/
   ├── lib/
   └── types/
   ```

3. **react-query Provider**
   - `@tanstack/react-query` 설치. `src/app/providers.tsx`에 `'use client'` + `QueryClientProvider`.
   - `layout.tsx`에서 children을 Provider로 감싼다. `<html lang="ko">`.

4. **`DATA_SOURCE` env 가드** — `src/lib/env.ts`
   - 서버 전용으로 `DATA_SOURCE`를 읽는 헬퍼. 시그니처 예:
     ```ts
     export type DataSource = 'mock' | 'live'
     export function getDataSource(): DataSource   // 기본값 'mock', 유효하지 않으면 throw
     ```
   - CRITICAL: `NEXT_PUBLIC_` 접두사를 붙이지 마라. 이유: 이 값은 서버 repository 스위치이며 클라이언트에 노출되면 안 된다.
   - `.env`에 `DATA_SOURCE=mock` 한 줄이 없으면 추가한다(기존 내용 보존).

5. **디자인 토큰 + 폰트** — `/docs/DESIGN.md` "디자인 토큰" 절의 값을 `globals.css`의 `:root` CSS 변수로 이식하고 Tailwind theme에 매핑한다. 실제 컴포넌트는 Step 7에서 만들되, **토큰 기반(인라인 style 남용 금지)** 을 이 step에서 확립한다.
   - **색상**: 액센트/브랜드 = **Coinbase Blue `#0052ff`**(press `#003ecc`). CRITICAL: UI_GUIDE의 옛 `teal` 지정은 DESIGN.md가 이 값으로 **오버라이드**했다 — teal을 쓰지 마라. 캔버스/서피스/hairline/ink/body/muted, 시맨틱 up(`#05b169`)·down(`#cf202f`)까지 DESIGN.md 색상 변수를 전부 넣는다.
   - **반경/간격/그림자**: DESIGN.md radius(xs~pill·full)·spacing(4px 베이스, `--container-max:1200px`, `--card-padding:32px`)·elevation(`--shadow-soft` 단일 카드 그림자 + `--focus-ring`)를 토큰으로.
   - **폰트**: `Inter`(display/sans) + `JetBrains Mono`(숫자, `tabular-nums`) + **`Pretendard`**(한글 본문 — Inter는 한글 글리프가 없으므로 sans/display fallback 앞단에 추가). Google Fonts로 Inter/JetBrains Mono 로드, Pretendard는 CDN 또는 next/font. `--font-display`/`--font-sans`/`--font-mono` 변수로.
   - **AI 슬롭 안티패턴은 그대로 유효**(UI_GUIDE): 보라/인디고 금지, glass morphism(backdrop blur) 금지, gradient-text 금지, 배경 gradient orb 금지. 액센트는 단일 브랜드색 `#0052ff`만.

## Acceptance Criteria

```bash
npm install
npm run build   # 컴파일 에러 없음 (빈 페이지라도 빌드 성공)
npm test        # Vitest가 0개 또는 sanity 테스트로 통과 (exit 0)
npm run lint    # 린트 에러 없음
```

- `npm test`가 "no test files"로 실패하지 않도록, `src/lib/env.test.ts`에 `getDataSource` 기본값 검증 테스트 1개를 둔다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `src/` 디렉토리가 ARCHITECTURE.md 구조(app/components/queries/services/lib/types)를 따르는가?
   - ADR-001 스택(Next.js 15 App Router)을 벗어나지 않았는가?
   - `DATA_SOURCE`가 서버 전용인가(`NEXT_PUBLIC_` 아님)?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약(설치된 주요 패키지 버전·생성 파일 포함)"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- 도메인 로직(CSV 파싱·집계·타입 계약)을 만들지 마라. 이유: 각각 Step 1~3의 scope이며 TDD 대상이다.
- `NEXT_PUBLIC_DATA_SOURCE`처럼 시크릿/서버 스위치를 클라이언트에 노출하지 마라. 이유: CLAUDE.md CRITICAL 시크릿 규칙.
- `pages/` 라우터를 쓰지 마라. App Router만. 이유: ADR-001.
- `docs/`·`scripts/`·`phases/`·`CLAUDE.md`를 수정/삭제하지 마라.
- 기존 테스트를 깨뜨리지 마라.
