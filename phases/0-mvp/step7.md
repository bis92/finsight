# Step 7: ui-primitives

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` (**이 step의 단일 참조** — 토큰·폰트·컴포넌트 목록·카테고리 팔레트·애니메이션. UI_GUIDE와 충돌 시 DESIGN.md 우선)
- `/docs/UI_GUIDE.md` (AI 슬롭 안티패턴·상세 표출(SideView/Modal) 규약·한국어 우선 — 색상 지정은 DESIGN.md로 대체됨)
- `/docs/design-reference/FinSight.dc.html` (원본 프로토타입 — 컴포넌트 시각 레퍼런스)
- `/CLAUDE.md` (컴포넌트는 components/ · SideView vs Modal 규약)
- `/docs/ARCHITECTURE.md` (Server/Client Component 기준)
- Step 0: `tailwind.config` · `globals.css` · `src/components/` (Step 0에서 확립한 DESIGN.md 토큰·폰트 변수)

이전 step의 Tailwind 설정(Step 0에서 이식한 DESIGN.md 토큰)을 확인하고, **토큰 기반으로만** 스타일링한 뒤 작업하라. 인라인 style 남용 금지.

## 작업

`src/components/ui/`에 재사용 UI 프리미티브를 만든다. **로직/데이터 페칭 없음** — 순수 프레젠테이션. **DESIGN.md "컴포넌트 목록"(§ Step 6에서 프리미티브화)** 을 구현 대상 목록으로, DESIGN.md 토큰을 픽셀 규약으로 준수한다. 모든 색/반경/그림자/폰트는 Step 0에서 이식한 토큰(CSS 변수 또는 Tailwind theme 매핑)으로만 지정한다.

만들 프리미티브(시그니처는 props 수준만, 내부는 재량 — DESIGN.md § 컴포넌트 목록):

1. **Button** — variant: `primary`(`#0052ff` fill, press `#003ecc`) · `secondary`(hairline 보더) · `outline-on-dark`(dark 밴드용 반투명 흰 보더) · `text`. 크기 `md`(38~44px)·`cta`(48~56px). 인터랙티브라 pill 반경. CRITICAL: 액센트는 **Coinbase Blue `#0052ff` 단일 브랜드색**, **teal·보라·인디고 금지**(DESIGN.md가 옛 teal을 오버라이드).
2. **Card** — white, `--radius-xl`(24px), padding 32(또는 22~28), 1px hairline, hover `--shadow-soft`(유일한 카드 그림자, tier 추가 금지). 카드 제목 슬롯(muted).
3. **Input** — hairline 보더, focus `--focus-ring`(`0 0 0 2px #0052ff`). 좌측 정렬.
4. **Badge/Pill** — caption-strong, pill. plan 배지: `FREE`(회색) / `PRO`·`OPUS 4.8`(primary fill).
5. **StatCard(KPI)** — 라벨(muted) + 숫자(**mono, tabular-nums**, 28px). 대시보드 KPI 4종에 사용.
6. **Modal** — 입력/수정/생성용. 오버레이 + 중앙 패널, `--radius-xl`. CRITICAL: backdrop-filter blur(glass morphism) 금지 — 불투명/반투명 단색 오버레이만. `'use client'`.
7. **SideView** — 우측 Drawer. **읽기전용 상세용**. `fs-slide`(0.25s) 애니메이션만. 인라인 편집 금지(표시만). `'use client'`.
8. **Amount** — 금액 표기 컴포넌트: 천단위 콤마 + `원`(또는 ₩), **`JetBrains Mono` + `tabular-nums`**. 지출=`--color-semantic-down`(`#cf202f`), 수입/절감=`--color-semantic-up`(`#05b169`) **텍스트 색 전용**(fill 금지). 날짜 포맷 헬퍼(`YYYY.MM.DD`, KST)는 `src/lib/format.ts`로 함께.
9. **차트 프리미티브** — DESIGN.md는 라이브러리 없이 **SVG 직접**을 전제한다: **Donut**(SVG `stroke-dasharray`, DESIGN.md `donutSrc` 로직 참조) · **BarRow**(카테고리 바) · **LegendRow**. 팔레트는 DESIGN.md "카테고리 팔레트(13종)"의 파란 계열 hex를 category별로 매핑(인접 조각 명도 구분, `수입`만 `#05b169`). client component, 데이터는 props로만. (recharts 등 도입 시에도 팔레트·SVG 규약은 동일.)
10. **행 컴포넌트** — **TxRow**(거래 행, 클릭 → SideView) · **MerchantRow**(상위 가맹점) · **SubscriptionRow**(구독 후보) · **FilterChip**(카테고리 필터, pill) · **MappingRow**(매핑 확인 행).
11. **레이아웃 프리미티브** — **TopNav**(앱바, `upload/mapping/dashboard/pro`에 표시) · **Footer**. 워드마크 `finsight`는 display 폰트 + primary.

전역 규약(반드시 지킴):
- **한국어 우선** — 모든 카피·레이블 한국어, 통화 ₩/원, 날짜 `YYYY.MM.DD`(KST). **숫자는 항상 mono + tabular-nums**.
- **display 헤드라인은 항상 weight 400**(bold 금지, DESIGN.md 타이포). display와 sans를 한 헤드라인에 섞지 않는다.
- **Light 서피스 기본**, 좌측 정렬 기본(데이터/폼 중앙정렬 금지). dark 서피스(`--color-surface-dark`)는 랜딩 hero·Pro 밴드 등 지정된 곳만.
- **AI 슬롭 안티패턴 금지**(UI_GUIDE 표, DESIGN.md에서도 유효): glass blur / gradient-text / "Powered by AI" 배지 / glow·neon 애니메이션 / **보라·인디고 브랜드색** / 모든 카드 동일 rounded-2xl(반경은 용도별로 pill vs xl 구분) / 배경 gradient orb / 데이터 중앙정렬.
- 애니메이션은 DESIGN.md 허용분만: `fs-fade`(fade+slide-up 0.28s) · `fs-slide`(Drawer 0.25s) · `fs-spin`(파싱 스피너). 그 외 금지. 아이콘 SVG 인라인 strokeWidth 1.5, 둥근 배경 박스로 감싸지 않는다.

## Acceptance Criteria

```bash
npm run build
npm test        # 프리미티브 렌더/포맷 헬퍼 테스트 통과
npm run lint
```

- 테스트 최소: `Amount`가 금액을 천단위 콤마+원으로, 지출/수입 색상 클래스를 올바로 적용. 날짜 포맷 헬퍼가 `YYYY.MM.DD` 반환. (jsdom 렌더 또는 순수 포맷 함수 테스트.)

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - DESIGN.md 토큰(액센트 `#0052ff`, Light 서피스, red/green 시맨틱, mono 숫자, Pretendard 한글)을 따르는가? **teal이 남아있지 않은가?**
   - AI 슬롭 안티패턴(blur·gradient-text·보라색·gradient orb 등)이 하나도 없는가?
   - Modal=입력/수정, SideView=읽기전용 규약을 지키는가?
   - 프리미티브가 데이터 페칭 없이 props만 받는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 7을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "생성 프리미티브 목록·차트 라이브러리 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 액센트에 **teal**(옛 UI_GUIDE 값)이나 보라/인디고를 쓰지 마라. 브랜드색은 `#0052ff` 단일. 이유: DESIGN.md 핵심결정 #1이 teal을 오버라이드.
- AI 슬롭 안티패턴을 하나라도 쓰지 마라(glass blur, gradient-text, gradient orb, "Powered by AI" 배지). 이유: UI_GUIDE·DESIGN.md 명시 금지.
- 프리미티브에서 데이터를 페칭하거나 `queries`/`services`를 import하지 마라. 이유: 순수 프레젠테이션 레이어.
- SideView에 편집 UI를 넣지 마라(읽기전용). 이유: 전역 상세 표출 규약.
- 기존 테스트를 깨뜨리지 마라.
