# Step 11: pro-report-gating

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` (**Pro 리포트 화면 스펙의 단일 참조** — § "Pro 리포트 `/pro`", 진단 세그먼트·고정비/변동비 스택바·절감 제안·구독 후보·페이월·업그레이드 Modal / 핵심결정 #3 세그먼트 강조 · #4 페이월 데이터레벨)
- `/CLAUDE.md` (plan 진실원천=profiles.plan · 클라이언트 plan 불신 · 페이월 데이터레벨 · 출력 신뢰경계)
- `/docs/PRD.md` (핵심기능 3: Pro 지출 진단 리포트 + 정기구독 후보 / 6: 결제 업그레이드 phase0=mock 게이팅)
- `/docs/UI_GUIDE.md` (페이월 데이터 레벨 차단·CSS 블러 아님 · 평문 렌더 · 숫자가 주인공)
- `/docs/ARCHITECTURE.md` (LlmService generateInsights Pro=Opus / 페이월 데이터 레벨)
- `/docs/ADR.md` (ADR-006 과금 깊이 게이팅, ADR-007 Polar plan 진실원천 phase1)
- Step 4: `src/services/` (`getProfileService`·mock plan·`generateInsights`·`detectSubscriptions`)
- Step 5: `src/app/api/` (pro-report/insights 라우트·서버 게이팅)
- Step 6: `src/queries/` (`useProReport`·`useProfile`) · Step 7 프리미티브(BarRow·SubscriptionRow·Badge·Modal·Card) · Step 8 대시보드

이전 step의 서버 게이팅 라우트와 profile/analyses 훅을 꼼꼼히 읽고 조립하라.

## 작업

**`src/app/pro/page.tsx`**(라우트 `/pro`)에 **Pro 지출 진단 리포트 + 정기구독 후보** 뷰와 **페이월 게이팅**을 만든다(DESIGN.md § Pro 리포트). 대시보드 개요 하단의 Pro 유도 dark 밴드에서 `/pro`로 연결. 상단 TopNav + `OPUS 4.8` 배지.

1. **Pro 지출 진단 리포트 뷰(plan==='pro')** — DESIGN.md 재현
   - `useProReport`(→ `/api/analyses` 또는 `/api/pro-report`)로 mock Insight와 구독 후보를 받아 표시. 숫자가 주인공, 서술형 텍스트는 보조.
   - **진단 요약** — 평문 **세그먼트 문단**(`{text, emphasis}[]`) 4개. emphasis 조각만 `<strong>` 스타일.
   - **고정비 vs 변동비** — 스택 바(BarRow) + 설명. 고정비=`주거·구독·공과금` 합(바 `#0a2a8f`), 변동비=나머지(바 `#7aa1ff`). 숫자는 코드 집계.
   - **절감 제안 3건** — 체크 아이콘 + 절감액(`savingKrw`) **녹색**(`#05b169`) 표기.
   - **정기구독 후보** — merchant·amount·cadence·confidence(SubscriptionRow). CRITICAL: "확정"이 아닌 **후보/추정** 문구, 단일 월 데이터면 추정임을 명시. 이유: PRD.
   - CRITICAL: LLM 출력(Insight)은 **평문 세그먼트 렌더** — 마크다운/HTML·`dangerouslySetInnerHTML` 금지, React 이스케이프 유지. 이유: 출력 신뢰경계·DESIGN.md 핵심결정 #3.

2. **페이월 게이팅(Free/게스트)**
   - CRITICAL: **서버에서 조회한 `profiles.plan`만 신뢰**한다. 클라이언트가 보낸 plan으로 Pro를 해제하지 마라. 실제 데이터 게이팅은 Step 5 서버 라우트가 수행(Free면 진단 데이터 미반환) — 이 step은 그 응답을 받아 잠금 카드를 렌더.
   - CRITICAL: 페이월은 **데이터 레벨 차단**이다(DESIGN.md 핵심결정 #4). Pro 데이터를 클라이언트로 받아 `filter:blur`로 가리지 마라(우회 가능). 잠금 카드(자물쇠 아이콘 + 업그레이드 CTA)는 **데이터 없이** 렌더하고, 흐림 처리가 필요하면 **정적 플레이스홀더**(실제 사용자 데이터 아님)만 쓴다.
   - 게스트는 `가입하고 Pro 체험`(→ `/login`), 회원(Free)은 `Pro로 업그레이드 ₩9,900/월`(업그레이드 Modal).

3. **업그레이드 Modal(mock)**
   - 가격 + Pro 기능 목록 + `Pro로 전환(데모)` 버튼. Phase 0은 실결제 없음 — 결제 시작 클릭 기록 자리(PII 없이)만 두거나 mock 업그레이드 안내. 실제 plan 변경은 Polar 웹훅(Phase 1)에서만.
   - CRITICAL: 클라이언트가 직접 plan을 'pro'로 바꾸는 경로를 만들지 마라. 이유: plan 진실원천은 Polar 웹훅으로 갱신된 profiles.plan.

## Acceptance Criteria

```bash
npm run build
npm test        # 게이팅 분기·평문 렌더 테스트 통과
npm run lint
```

- 테스트 최소: Free plan에서 Pro 리포트 데이터가 렌더되지 않고 업그레이드 CTA만 표시(서버가 데이터 미반환), Pro plan에서 진단/구독 후보가 렌더, Insight가 평문(HTML 미해석)으로 렌더.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 게이팅이 서버 조회 plan 기반이고 클라이언트 plan을 신뢰하지 않는가?
   - 페이월이 데이터 레벨 차단(Free엔 데이터 미도달·정적 플레이스홀더만)인가, `filter:blur`가 아닌가?
   - 구독 후보가 "확정"이 아닌 후보/추정 표현인가? 고정비/변동비·절감액이 코드 집계·DESIGN.md 색인가?
   - Insight 평문 **세그먼트** 렌더(마크다운/HTML·dangerouslySetInnerHTML 없음)인가?
   - 클라이언트가 plan을 직접 변경하는 경로가 없는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 11을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "Pro 리포트 뷰·페이월 게이팅 방식 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 클라이언트가 보낸 plan을 신뢰해 Pro를 해제하지 마라. 이유: CLAUDE.md CRITICAL 권한 진실원천.
- Pro 데이터를 Free에 내려보내 CSS 블러로 가리지 마라(데이터 레벨 차단). 이유: 우회 가능·UI_GUIDE.
- 클라이언트에서 plan을 'pro'로 바꾸는 API/경로를 만들지 마라. 이유: plan은 Polar 웹훅으로만 갱신(Phase 1).
- 구독 후보를 "확정"으로 표현하거나 Insight를 마크다운/HTML로 렌더하지 마라. 기존 테스트를 깨뜨리지 마라.
