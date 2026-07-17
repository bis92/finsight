# Step 8: dashboard

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` (**대시보드 화면 스펙의 단일 참조** — § "대시보드 `/dashboard`", KPI 4·3탭·SideView·재분류 Modal·도넛 크기·팔레트)
- `/CLAUDE.md` (SideView vs Modal · category enum · 페칭 단일 경로)
- `/docs/PRD.md` (핵심기능 2: Free 대시보드 + 기본 분석)
- `/docs/UI_GUIDE.md` (숫자가 주인공 · 상세 표출 규약 · 한국어 우선 — 레이아웃 폭/색은 DESIGN.md 우선)
- `/docs/ARCHITECTURE.md` (Server/Client Component · 로딩/에러/빈 상태)
- Step 1: `src/types/` (Category 13종)
- Step 6: `src/queries/` (`useTransactions`, `useInsights`, `useReclassify`, `useProfile`)
- Step 7: `src/components/ui/` (StatCard·Card·Button·Modal·SideView·Amount·Donut·BarRow·LegendRow·TxRow·MerchantRow·FilterChip·TopNav)

이전 step의 queries 훅과 UI 프리미티브를 꼼꼼히 읽고, **새 컴포넌트를 만들지 말고 Step 7 프리미티브를 조립**해 DESIGN.md 화면을 재현하라.

## 작업

`src/app/dashboard/`에 **Free 대시보드**를 만든다. 새 UI 프리미티브를 만들지 말고 Step 7 컴포넌트를 조립한다. 데이터는 Step 6 queries 훅으로만 가져온다(직접 fetch·services import 금지). 상단 앱바(TopNav) 표시. 레이아웃은 DESIGN.md 컨테이너(`--container-max:1200px`), 좌측 정렬, 숫자가 주인공.

화면 구성(**DESIGN.md § 대시보드 `/dashboard`** 를 그대로 재현):

1. **헤더 + 탭** — 개요/카테고리/명세 3탭(pill 세그먼트). 게스트 모드(`?guest=1`)면 상단에 DEMO 배너 + `내 파일로 해보기` CTA.
2. **KPI 4** (StatCard, 숫자 mono) — **총지출 / 총수입(녹색) / 순수지(수입−지출) / 거래 건수**. (주의: DESIGN.md는 순지출이 아니라 `순수지=inc−exp`를 KPI로 둔다. Amount 시맨틱 색: 지출 red / 수입·순수지 부호에 따라.)
3. **탭 A 개요** — Donut(**180px**) + 카테고리 top6 LegendRow / 상위 가맹점 top6(MerchantRow) / 최근 거래 8건(TxRow, 클릭 → SideView) / 하단 **Pro 유도 dark 밴드**(Step 11에서 채움).
4. **탭 B 카테고리** — 큰 Donut(**220px**) / 카테고리별 지출 바 전체(BarRow) / 상위 가맹점 + 정기구독 요약.
5. **탭 C 명세** — 좌측 카테고리 FilterChip / 중앙 거래 원장(필터·합계) / 우측 필터합계·상위3·구독 요약 카드.
6. **기본 분석(Free)** — `useInsights`로 받은 mock Insight를 **평문 세그먼트**(`{text, emphasis}[]`)로 표시. CRITICAL: 마크다운/HTML 렌더 금지, `dangerouslySetInnerHTML` 금지, React 기본 이스케이프 유지. 이유: LLM 출력 신뢰경계.
7. **SideView(거래 상세)** — 가맹점·금액·거래일·카드·카테고리 + `카테고리 재분류` 버튼 + 메모 입력. 읽기전용, 인라인 편집 금지.
8. **재분류 Modal** — category enum **chip 선택**(13종) → `useReclassify` mutation, 즉시 반영. 성공 시 목록/집계 invalidate. CRITICAL: category는 enum 값만 전송.

집계 숫자는 **코드로 계산된 값**(Step 3 `aggregate` = `/api/insights` 또는 집계 응답)을 쓴다. 도넛 조각·바 색은 DESIGN.md 카테고리 팔레트(13종 파란 계열, `수입`만 녹색).

상태 처리:
- 로딩/에러/빈(empty) 상태를 Step 6 표준 처리로 표시. 에러는 서버 `message` 그대로(상태코드 치환 금지).
- 거래 0건이면 "업로드 유도" empty 상태(Step 9 업로드 화면 `/upload`로의 CTA).

인터랙션이 필요한 부분만 Client Component, 나머지는 Server Component 기본(ARCHITECTURE).

## Acceptance Criteria

```bash
npm run build
npm test        # 대시보드 조립·재분류 상호작용 테스트(가능 범위) 통과
npm run lint
```

- 테스트 최소: 대시보드가 mock 집계로 총지출/순지출·카테고리·상위가맹점을 렌더, 재분류 Modal이 enum 카테고리를 mutation으로 보냄(훅 mock).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 데이터가 queries 훅(`/api/*`) 단일 경로로만 오는가(직접 fetch·services import 없음)?
   - 상세=SideView, 재분류=Modal 규약을 지키는가?
   - Insight를 평문 세그먼트로 렌더(마크다운/HTML·dangerouslySetInnerHTML 없음)하는가?
   - KPI 4·3탭·도넛 크기(180/220px)·13종 팔레트 등 DESIGN.md 화면 스펙을 따르는가?
   - 좌측 정렬·`#0052ff` 액센트·red/green 시맨틱·mono 숫자 토큰을 지키는가(teal 없음)?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 8을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "대시보드 화면 구성·사용한 훅/컴포넌트 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 대시보드에서 직접 `fetch`·`services` import·mock 데이터를 쓰지 마라. queries 훅만. 이유: 단일 경로·시임 불변.
- Insight/merchant 등 LLM·CSV 유래 문자열을 마크다운/HTML로 렌더하지 마라. 이유: 출력 신뢰경계(인젝션·XSS).
- 상세를 Modal로, 재분류를 SideView로 뒤바꾸지 마라. 이유: 전역 규약.
- 새 UI 프리미티브를 중복 생성하지 마라(Step 7 재사용). 기존 테스트를 깨뜨리지 마라.
