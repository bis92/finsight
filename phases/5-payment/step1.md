# Step 1: upgrade-flow

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (plan 진실원천=Polar 웹훅으로 갱신된 `profiles.plan` · 클라이언트 plan 불신 · 외부 API는 서버에서만 · API 에러는 서버 `message` 그대로 노출)
- `/docs/ADR.md` (ADR-007 결제=Polar MoR·실결제 phase 1 · ADR-006 과금 게이팅)
- `/docs/PRD.md` (핵심 기능 6: 결제 업그레이드 · 가격 ₩9,900/월)
- `/docs/DESIGN.md` (§ Pro 리포트 · 업그레이드 Modal 스펙 — UI 구조는 이미 존재, 배선만 교체)
- Step 0 산출물: `phases/5-payment/step0.md` → `src/app/api/checkout/route.ts` (`POST /api/checkout` → `{ url }`)
- `/src/app/pro/ProReportClient.tsx` (기존 mock 업그레이드 Modal — "Phase 0 데모에서는 결제나 플랜 변경이 일어나지 않습니다" 문구·`setUpgradeOpen`·`Pro로 전환(데모)` 버튼)
- `/phases/0-mvp/step11.md` (pro-report-gating — 페이월·업그레이드 Modal 설계 의도)
- `/src/queries/` (기존 react-query 훅·`apiClient`/`ApiError` 공용 경로 — checkout 호출도 이 경로를 따른다면 참고)

기존 `ProReportClient.tsx`의 Modal 구조와 게이팅 분기를 꼼꼼히 읽고, UI를 새로 만들지 말고 **배선만** 교체하라.

## 배경

`0-mvp`의 업그레이드 Modal은 `Pro로 전환(데모)` 버튼이 그냥 Modal을 닫고 "결제나 플랜 변경이 일어나지 않습니다"를 안내하는 mock이다. 이 step은 그 버튼이 step0의 실제 `POST /api/checkout`를 호출해 Polar checkout 페이지로 이동하도록 배선한다. Modal·페이월·가격 등 시각 구조는 그대로 두고 동작만 실연동한다.

## 작업

### `src/app/pro/ProReportClient.tsx` (또는 Modal 배선을 담은 컴포넌트) — checkout 호출로 교체

1. **checkout 호출** — 업그레이드 Modal의 CTA(기존 `Pro로 전환(데모)`)를 누르면:
   - 공용 `apiClient`(또는 react-query mutation)로 `POST /api/checkout`를 호출한다.
   - 성공 시 응답 `{ url }`로 **브라우저를 리다이렉트**한다(`window.location.href = url`). Polar 결제 페이지로 이동.
   - 진행 중에는 버튼을 로딩/비활성 상태로 두어 중복 호출을 막는다.
   - 실패 시 서버 응답 `message`를 **그대로** 노출한다(CLAUDE.md 전역 규약: 상태코드→한글 치환 테이블 금지). 401이면 로그인 유도 흐름으로 연결(게스트 분기는 기존대로 `/login`).
   - 문구 교체: "Phase 0 데모에서는 결제나 플랜 변경이 일어나지 않습니다" 같은 mock 안내는 제거하거나 결제 안내 문구로 교체한다.

2. **success/cancel 리다이렉트 처리** — checkout 완료 후 Polar가 step0에서 지정한 `success_url`/`cancel_url`(예: `/pro?checkout=success` · `/pro?checkout=cancel`)로 돌려보낸다.
   - `?checkout=success`면 "결제가 확인되면 곧 Pro가 활성화됩니다" 류의 대기 안내를 보인다. CRITICAL: 이 시점에 **클라이언트가 plan을 'pro'로 바꾸지 마라**. 실제 활성화는 웹훅(step2)이 `profiles.plan`을 갱신한 뒤 `useProfile` 재조회로 반영된다. success 파라미터를 근거로 Pro 기능을 해제하지 마라(웹훅 지연 가능).
   - `?checkout=cancel`이면 결제 취소 안내만 보이고 상태 변경 없음.
   - plan 상태는 언제나 서버 조회(`useProfile` → `/api/profile` → 서버 `profiles.plan`)만 신뢰한다. 필요 시 success 이후 `profile` 쿼리를 무효화(refetch)해 갱신을 앞당길 수 있으나, 확정 근거는 항상 서버 plan이다.

3. **게이팅 불변** — Pro 뷰 노출 조건은 기존대로 서버 조회 `profile.plan === 'pro'`. 이 조건을 클라이언트 상태(checkout 성공 플래그 등)로 대체하지 마라.

## Acceptance Criteria

```bash
npm run build
npm test
npm run lint
```

- 테스트 최소(`apiClient`/fetch·`window.location` 목킹): 업그레이드 CTA가 `POST /api/checkout`를 호출하고 반환된 `url`로 리다이렉트한다; checkout 실패 시 서버 `message`가 노출된다; `?checkout=success`가 있어도 클라이언트가 plan을 직접 'pro'로 바꾸지 않고 Pro 뷰 노출은 서버 `profile.plan`에만 의존한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - CTA가 서버 `/api/checkout`를 호출하고 Polar를 클라이언트에서 직접 부르지 않는가?
   - Pro 뷰 게이팅이 여전히 서버 조회 `profile.plan==='pro'`에만 의존하는가(checkout 성공 플래그로 해제하지 않는가)?
   - `?checkout=success`가 클라이언트 plan 변경을 유발하지 않는가?
   - checkout 실패 시 서버 `message`를 그대로 노출하는가(상태코드→한글 치환 테이블 없음)?
   - 중복 클릭 방지(로딩/비활성)가 있는가?
3. 결과에 따라 `phases/5-payment/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "업그레이드 Modal→/api/checkout 배선·success/cancel 리다이렉트 처리 방식 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 클라이언트가 보낸/추론한 plan 값(checkout 성공 플래그 포함)으로 Pro 기능을 해제하지 마라. 이유: plan 진실원천은 Polar 웹훅으로 갱신된 `profiles.plan`.
- 클라이언트에서 Polar를 직접 호출하거나 plan을 'pro'로 바꾸는 API/경로를 만들지 마라. 이유: 외부 API는 서버에서만, 셀프 업그레이드 차단.
- API 에러를 상태코드→한글 치환 테이블로 덮지 마라. 서버 응답 `message`를 그대로 노출하라. 이유: CLAUDE.md 전역 규약.
- Modal/페이월/가격 시각 구조를 새로 설계하지 마라(배선만 교체). 이유: mock-first UI 불변 원칙.
- 기존 테스트를 깨뜨리지 마라.
