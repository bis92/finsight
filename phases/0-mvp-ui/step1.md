# Step 1: design-system

## 읽어야 할 파일
- `/docs/UI_GUIDE.md` (색상 토큰, 컴포넌트 스타일, 상세 표출 규약, 안티패턴)
- `/CLAUDE.md` (상세 보기 규약: 읽기=SideView, 수정=Modal)
- `/docs/ARCHITECTURE.md` (디렉토리 구조)
- 이전 step 산출물: `src/app/globals.css`, `tailwind.config.*`, `src/app/layout.tsx`

## 작업
`UI_GUIDE.md`의 디자인 토큰과 재사용 프리미티브를 만든다. 이후 모든 화면이 이걸 재사용한다.

1. **디자인 토큰**: `UI_GUIDE.md`의 Light 팔레트(teal 액센트, 무채색, green=수입/red=지출 시맨틱)를 Tailwind theme(`tailwind.config`) 또는 `globals.css` CSS 변수로 정의. 보라/인디고·glass morphism·gradient orb 등 안티패턴 금지.
2. **UI 프리미티브** (`src/components/ui/`): `Button`(primary/secondary/text variant), `Card`, `Input`, `Badge`/`Pill`, `Modal`(입력·수정·생성용, 백드롭·ESC 닫기·포커스 트랩), `Drawer`(=SideView, 읽기전용 상세용, 우측 슬라이드·닫기 쉬움). 각 컴포넌트는 시그니처(props)만 정하고 구현은 재량. 접근성(포커스 가시성, aria) 준수.
3. **앱 셸**: `src/components/layout/`의 헤더/컨테이너 등 공용 레이아웃 요소(최소).
4. 각 프리미티브에 **최소 렌더 테스트**를 co-locate(예: `Button.test.tsx` — 렌더되고 라벨/variant가 반영되는지). 이유: tdd-guard 훅이 `components/**/*.tsx`에 테스트 선행을 요구한다.

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test
```

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 색·타이포가 `UI_GUIDE.md` 토큰을 쓰는가(하드코딩 남발 금지)?
   - `Modal`과 `Drawer`가 **분리된 프리미티브**로 존재하는가(수정=Modal / 읽기=SideView 규약)?
   - 안티패턴(보라색·glass·gradient orb·네온 글로우)이 없는가?
3. `phases/0-mvp-ui/index.json`의 step 1 업데이트(completed+summary / error).

## 금지사항
- SideView(Drawer) 안에서 인라인 편집 패턴을 만들지 마라. 이유: 읽기=SideView, 수정=Modal 규약 분리.
- 도메인 컴포넌트(대시보드 카드, 업로드 폼 등)를 만들지 마라. 이유: 이 step은 범용 프리미티브만. 도메인 UI는 이후 step.
- 외부 UI 라이브러리(MUI 등)를 도입하지 마라. 이유: Tailwind + 자체 프리미티브 기조 유지.
