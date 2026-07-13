# DESIGN — FinSight UI 구현 스펙

> 이 문서는 디자인 구현의 **단일 참조(source of truth)**다. `PRD.md`·`ARCHITECTURE.md`·`ADR.md`·`UI_GUIDE.md`와 정합하며, 충돌 시 아래 "핵심 결정사항"이 우선한다.
> 원본 디자인: `docs/design-reference/FinSight.dc.html` (Claude Design 산출물, DC 런타임 형식). 토큰 원본: `docs/design-reference/tokens/*.css`.

디자인 원본은 단일 HTML 파일 안에서 상태(`screen`)로 화면을 전환하는 SPA 프로토타입이다. 이를 **Next.js 15 App Router의 실제 라우트 + mock-first 데이터 흐름**으로 재구성한다.

---

## 핵심 결정사항 (구현 전 확정 — 반드시 준수)

1. **액센트/브랜드 색상 = Coinbase Blue `#0052ff`** (원본 디자인 유지).
   - `UI_GUIDE.md`의 기존 teal 지정은 이 값으로 **오버라이드**한다(문서도 갱신됨). 도넛·카테고리·차트 팔레트 전체가 파란 계열이다.
   - 단, `UI_GUIDE.md`의 다른 AI-슬롭 안티패턴(보라/인디고 금지, glass morphism 금지, gradient-text 금지, 그라데이션 배경 orb 금지 등)은 **그대로 유효**하다.

2. **카테고리 enum = 병합안 13종 (고정, 자유 문자열 금지)**:
   `식비 · 카페/간식 · 교통 · 쇼핑 · 구독 · 주거 · 공과금 · 문화/여가 · 의료 · 금융 · 교육 · 수입 · 기타`
   - 원본 디자인 9종(식비·쇼핑·주거·구독·공과금·교통·문화/여가·카페/간식·의료) + `수입`에, ARCHITECTURE의 누락분(`금융`·`교육`·`기타`)을 보강한 세트다.
   - `수입`은 지출 카테고리가 아니라 `direction='income'` 거래의 표시 레이블로 쓴다.

3. **LLM 출력은 평문 렌더 — `dangerouslySetInnerHTML` 금지.**
   - 원본은 Pro 진단문에 `dangerouslySetInnerHTML`로 `<strong>` 강조를 넣지만, 이는 **보안 규칙 위반**이다.
   - 강조는 **구조화 세그먼트 배열**(`{ text, emphasis: boolean }[]`)로 표현하고 React가 이스케이프하게 둔다. 마크다운/HTML 렌더 금지.

4. **페이월 = 데이터 레벨 차단 (CSS blur 아님).**
   - 원본은 `filter:blur(6px)`로 Pro 콘텐츠를 흐리지만, 실제 구현에서는 **서버(`/api`)가 plan을 검사해 Free/게스트에게 Pro 데이터(진단·절감·구독 후보)를 아예 전송하지 않는다.**
   - 잠금 카드(자물쇠 아이콘 + 업그레이드 CTA)는 데이터 없이 렌더한다. 흐림 처리된 텍스트는 **정적 플레이스홀더**(실제 사용자 데이터 아님)만 허용.

5. **스타일 = Tailwind + 디자인 토큰.**
   - 원본의 인라인 `style` + CSS 변수를 → `globals.css`의 CSS 변수(토큰) + Tailwind theme 매핑으로 변환한다. 인라인 style 남용 금지.

6. **폰트 = Inter + JetBrains Mono + 한글 보강.**
   - Inter는 한글 글리프가 없다. 한글 본문 가독성을 위해 **Pretendard**(또는 동급 한글 웹폰트)를 sans/display fallback 앞단에 추가한다. 숫자는 항상 `JetBrains Mono`(mono, `tabular-nums`).

---

## 디자인 토큰 (globals.css로 이식할 값)

원본: `docs/design-reference/tokens/*.css`. 아래 값을 `:root` CSS 변수로 넣고 Tailwind theme에 매핑한다.

### 색상 (`colors.css`)
```
--color-primary: #0052ff;          /* 단일 액션 색 — CTA·워드마크·인라인 링크에만 scarce하게 */
--color-primary-active: #003ecc;   /* press */
--color-primary-disabled: #a8b8cc;
--color-accent-yellow: #f4b000;    /* 일러스트 전용 (미사용 가능) */

--color-canvas: #ffffff;           /* 페이지/카드 */
--color-surface-soft: #f7f7f7;     /* body 배경, 강조면 */
--color-surface-strong: #eef0f3;   /* chip/avatar 배경 */
--color-surface-dark: #0a0b0d;     /* dark hero/band */
--color-surface-dark-elevated: #16181c; /* dark 위 카드 */

--color-hairline: #dee1e6;         /* 1px 보더 */
--color-hairline-soft: #eef0f3;    /* 행 구분선 */

--color-ink: #0a0b0d;              /* 주 텍스트 */
--color-body: #5b616e;             /* 본문 */
--color-muted: #7c828a;            /* 보조 */
--color-muted-soft: #a8acb3;
--color-on-dark: #ffffff;
--color-on-dark-soft: #a8acb3;

--color-semantic-up: #05b169;      /* 수입·절감 — 텍스트 색 전용, fill 금지 */
--color-semantic-down: #cf202f;    /* 지출·경고 — 텍스트 색 전용, fill 금지 */
```

### 반경 (`radius.css`)
```
--radius-xs:4px --radius-sm:8px --radius-md:12px --radius-lg:16px --radius-xl:24px
--radius-pill:100px --radius-full:9999px
```
- 인터랙티브(CTA·검색·배지·필터칩) = pill. 컨테이너(카드·mockup·가격티어) = xl(24px). 아바타/도트 = full.

### 간격 (`spacing.css`)
```
4px 베이스. --space-section:96px(밴드 간). --container-max:1200px. --card-padding:32px.
카드 간 24px, 카드 내부 패딩 32px.
```

### 그림자 (`elevation.css`)
```
--shadow-soft: 0 4px 12px rgba(0,0,0,.04);   /* 유일한 카드 hover 그림자 — 추가 tier 금지 */
--focus-ring: 0 0 0 2px var(--color-primary);
플로팅 mockup 카드만 예외: 0 24px 60px rgba(0,0,0,.45)
```

### 타이포 (`typography.css`)
```
display: Inter weight 400 (never bold), 음수 tracking (-2px ~ -0.5px). hero 헤드라인 전용.
  mega 80 / xl 64 / lg 52 / md 44 / sm 36
title: 32(400)/18(600)/16(600)
body: 16 / 14 / caption 13 / caption-strong 12(600)
number: JetBrains Mono 500, tabular-nums — 모든 숫자
button 16(600), nav-link 14(500)
```
- **display 헤드라인은 항상 weight 400.** bold 금지. display와 sans를 한 헤드라인에 섞지 않는다.

### 폰트 (`fonts.css` → 한글 보강)
```
--font-display / --font-sans: "Pretendard", "Inter", -apple-system, system-ui, ... , sans-serif
--font-mono: "JetBrains Mono", ui-monospace, ... , monospace
```
Google Fonts로 Inter/JetBrains Mono 로드. Pretendard는 CDN(예: cdn.jsdelivr.net/gh/orioncactus/pretendard) 또는 next/font.

---

## 카테고리 팔레트 (병합안 13종 → 색 배정)

도넛/바/도트에 쓰는 채도 낮은 파란 계열. 인접 조각은 명도로 구분. `수입`만 semantic-up 녹색.

| category | hex | 비고 |
|----------|-----|------|
| 식비 | `#0052ff` | primary |
| 쇼핑 | `#0a2a8f` | 최심 |
| 주거 | `#2f6bff` | |
| 구독 | `#5185ff` | |
| 금융 | `#3d5a9e` | 신규 |
| 공과금 | `#7aa1ff` | |
| 교육 | `#6b8fd6` | 신규 |
| 의료 | `#8aa6ff` | |
| 교통 | `#9bb6ff` | |
| 문화/여가 | `#bcccff` | |
| 카페/간식 | `#d1ddff` | 최연 |
| 기타 | `#aeb8cc` | 중립 |
| 수입 | `#05b169` | semantic-up(녹색) |

고정비 vs 변동비(Pro 리포트): 고정비 = `주거·구독·공과금`, 나머지 = 변동비. 고정비 바 `#0a2a8f`, 변동비 바 `#7aa1ff`.

---

## 화면 인벤토리 & 라우트 매핑

원본 `screen` 상태 → App Router 라우트. 상단 앱바는 `upload/mapping/dashboard/pro`에만 표시.

| 원본 screen | 라우트 | Step | 설명 |
|-------------|--------|------|------|
| `landing` | `/` (marketing) | 7 | dark hero + 플로팅 mockup, 기능 3카드, 요금제 2티어, footer |
| `auth` | `/login` (auth) | 7 | 카카오/구글 OAuth 버튼(mock), 약관 |
| `upload` | `/upload` | 8 | 드롭존(idle/parsing/parsed), 샘플 CSV, 파싱 요약 |
| `mapping` | `/upload/mapping` | 8 | 컬럼 매핑 확인 표(신뢰도·표준필드), 수동 매핑 |
| `dashboard` | `/dashboard` | 9 | KPI 4 + 3탭(개요/카테고리/명세) + SideView + 재분류 Modal |
| `pro` | `/pro` | 10 | Pro 진단 리포트 or 페이월(데이터 레벨) + 업그레이드 Modal |

게스트 데모: 랜딩의 "샘플로 먼저 보기" → `/dashboard?guest=1` 읽기전용 배너. Free→Pro CTA는 대시보드 개요 하단 밴드 + Pro 페이월.

오버레이(전 화면 공용): **SideView**(거래 상세, 우측 Drawer, 읽기전용) · **재분류 Modal**(category enum chip 선택) · **업그레이드 Modal**.

---

## 화면별 구성 요약

### 랜딩 `/`
- 상단 nav: 워드마크 `finsight`(display, primary) + 기능/요금제/보안 링크 + 로그인/시작하기.
- **dark hero** (`--color-surface-dark`): 좌측 eyebrow 배지 + H1(display 64px `내 돈이 어디로 갔는지, 3분 안에.`) + 서브카피 + CTA 2개(`내 파일로 시작하기`/`샘플로 먼저 보기`). 우측 **플로팅 mockup 카드 2장**(총지출 카드 + Opus 진단 카드, `0 24px 60px` 그림자).
- feature band(white): 3개 `FeatureCard`(컬럼 자동 매핑 / 통합 대시보드 / Pro 지출 진단).
- pricing band(soft): Free(₩0)/Pro(₩9,900/월, OPUS 4.8 배지) 2티어. Pro 티어는 dark 카드.
- footer.

### 로그인 `/login`
- 중앙 카드(400px): 워드마크 + `3초 만에 시작하기` + 카카오(노란 `#FEE500`)/구글 버튼 + 약관 문구. mock 인증 → `/upload`.

### 업로드 `/upload`
- `1/2 단계` 라벨 + 제목 + 안내. 드롭존(대시된 보더, 클릭/드래그) → parsing(스피너) → parsed(파일 요약: 인코딩 EUC-KR·거래 35행·컬럼 7개 + 성공 배지). `컬럼 확인하기 →` → `/upload/mapping`.

### 매핑 `/upload/mapping`
- `2/2 단계`. 안내 배너(샘플 20행만 분석). 매핑 표(원본 컬럼 / 표준 필드 chip / 신뢰도). `confidence < 0.75`(예: 업종 74%)는 붉게 강조 + 수동 매핑 가능(전 컬럼 드롭다운). `무시` 필드 표시. 확인 → `/dashboard`.

### 대시보드 `/dashboard`
- (게스트) DEMO 배너 + `내 파일로 해보기`.
- 헤더 + 탭(개요/카테고리/명세, pill 세그먼트).
- **KPI 4**: 총지출 / 총수입(녹색) / 순수지(수입−지출) / 거래 건수. 숫자 mono.
- **탭 A 개요**: 도넛(180px)+카테고리 top6 레전드 / 상위 가맹점 top6 / 최근 거래 8건(행 클릭 → SideView) / Pro 유도 dark 밴드.
- **탭 B 카테고리**: 큰 도넛(220px) / 카테고리별 지출 바(전체) / 상위 가맹점 + 정기구독 요약.
- **탭 C 명세**: 좌측 카테고리 필터 chip / 중앙 거래 원장(필터·합계) / 우측 필터합계·상위3·구독 요약 카드.
- **SideView**: 가맹점·금액·거래일·카드·카테고리 + `카테고리 재분류` 버튼 + 메모 입력. 읽기전용, 인라인 편집 금지.
- **재분류 Modal**: category enum chip 선택 → 즉시 반영.

### Pro 리포트 `/pro`
- 헤더(OPUS 4.8 배지).
- **Pro인 경우**: 진단 요약(평문 세그먼트 문단 4개) / 고정비 vs 변동비(스택 바 + 설명) / 절감 제안 3건(체크 아이콘 + 절감액 녹색) / 정기구독 후보(추정, 확정 아님 명시).
- **Free/게스트**: 페이월 잠금 카드(자물쇠 + 업그레이드 CTA). 게스트→`가입하고 Pro 체험`, 회원→`Pro로 업그레이드 ₩9,900/월`(업그레이드 Modal). **서버가 진단 데이터를 안 보냄.**
- **업그레이드 Modal**: 가격 + Pro 기능 목록 + `Pro로 전환(데모)`(mock plan 전환). phase 0 실결제 없음.

---

## Mock 데이터 (원본 그대로 — services 층 fixture로 사용)

원본 `FinSight.dc.html` 하단 `data-dc-script`의 값과 동일하게 유지한다. 상세 코드는 원본 `<script>` 참조(거래 35행, 구독 5건, 매핑 7행). 요약:

- **거래 35건**(2026-06): `[일, 가맹점, 금액(원, 부호없는 정수), 카테고리, 카드, direction?]`. 예: `['01','배달의민족',23900,'식비','신한카드']`, 급여 `['25','급여 입금',3200000,'수입','—','income']`.
  - **저장 규칙**: `amount`는 부호 없는 정수, `direction`('expense'|'income')으로 구분. 원본 카테고리 `카페/간식`은 병합 enum에 그대로 존재.
- **정기구독 후보 5건**: 넷플릭스 13,500 / 유튜브 프리미엄 14,900 / 쿠팡 와우 7,890 / 에이블짐 헬스장 99,000 / Microsoft 365 11,900 (각 cadence·note 포함). 월 합계 ₩147,190.
- **매핑 7행**: 이용일자→거래일 98% / 가맹점명→가맹점 96% / 이용금액→금액 99% / 결제카드→카드 91% / 업종→카테고리(추정) 74%(low) / 승인번호→무시 / 이용구분→무시.
- 파싱 요약: 인코딩 `EUC-KR`, 35행, 7컬럼, 파일명 `shinhan_card_2026-06.csv`.

집계는 **코드로 계산**(카테고리 합·비율·KPI·top3·고정/변동비). 원본 로직 참조:
- 순지출/KPI: `exp = Σ expense.amount`, `inc = Σ income.amount`, 순수지 = `inc - exp`.
- 도넛: 카테고리별 합 → SVG `stroke-dasharray` 계산(원본 `donutSrc` 참조).
- 고정비 = `주거·구독·공과금` 합, 변동비 = `exp - 고정비`.

---

## 컴포넌트 목록 (Step 6에서 프리미티브화)

- **Button**: primary(`#0052ff` fill) / secondary(hairline 보더) / outline-on-dark(반투명 흰 보더) / text. 크기 md(38~44px)·cta(48~56px). press = `#003ecc`.
- **Card**: white, `radius-xl`, padding 32(또는 22~28), 1px hairline, hover `--shadow-soft`.
- **Badge/Pill**: caption-strong, pill. plan 배지(FREE 회색 / PRO·OPUS 4.8 primary fill).
- **StatCard(KPI)**: 라벨(muted) + 숫자(mono 28px).
- **TopNav**(앱바) / **Footer**.
- **Donut**(SVG, dasharray) / **BarRow**(카테고리 바) / **LegendRow**.
- **TxRow**(거래 행) / **MerchantRow** / **SubscriptionRow**.
- **SideView**(우측 Drawer, `fs-slide` 애니메이션) / **Modal**(중앙, 오버레이).
- **FilterChip**(카테고리 필터) / **MappingRow**.

## 애니메이션 (원본 유지 — UI_GUIDE 허용 범위)
- `fs-fade`(fade+slide-up 0.28s, 화면 진입) / `fs-slide`(Drawer 0.25s) / `fs-spin`(파싱 스피너). 그 외 금지.

---

## 참조 경로
- 원본 프로토타입: `docs/design-reference/FinSight.dc.html`
- 토큰 원본: `docs/design-reference/tokens/{colors,typography,radius,spacing,elevation,fonts}.css`
- 디자인 시스템 설명: `docs/design-reference/design-system-readme.md` (Coinbase 마케팅 브랜드 컨셉 배경)
