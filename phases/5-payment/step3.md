# Step 3: plan-lifecycle

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (plan 진실원천=Polar 웹훅으로 갱신된 `profiles.plan` · `SUPABASE_SERVICE_ROLE_KEY`는 Polar 웹훅 plan 갱신에만 · 클라이언트 plan 불신)
- `/docs/ADR.md` (ADR-007 결제=Polar MoR·plan 진실원천·**단순 멱등**만)
- Step 2 산출물: `phases/5-payment/step2.md` → `src/app/api/webhooks/polar/route.ts` (서명 검증·유저 매핑·service-role 갱신·멱등 골격 — 이 라우트를 확장한다)
- `src/lib/supabase/service-role-client.ts` (service-role 클라이언트 — plan 갱신 전용)
- `/src/types/plan.ts` (`Plan = 'free' | 'pro'` · `polarSubscriptionId`/`polarCustomerId`)

step2 웹훅 라우트의 서명 검증·유저 식별·멱등 구조를 꼼꼼히 읽고, **동일 라우트에 취소/만료 이벤트 분기를 추가**하라(새 엔드포인트를 만들지 마라).

## 배경

구독은 취소·만료·결제 실패로 종료될 수 있다. Pro 권한을 회수(→ `free` 다운그레이드)하는 것도 활성화와 마찬가지로 **웹훅 단일 경로**로만 처리한다. 클라이언트가 "취소했다"는 신호로 다운그레이드하지 않는다. step2와 동일한 서명 검증·service-role·멱등 규율을 그대로 따른다.

## 작업

### `src/app/api/webhooks/polar/route.ts` — 취소·만료 이벤트 분기 추가

1. **종료 계열 이벤트 처리** — Polar 스키마의 구독 종료 이벤트(예: `subscription.canceled`/`subscription.revoked`/`subscription.uncanceled` 되돌림 등, 결제 실패로 인한 종료 포함)를 분기한다.
   - 대상 유저는 step2와 동일하게 이벤트의 우리 `userId` 또는 저장된 `polar_subscription_id`/`polar_customer_id` 매핑으로 식별한다.
   - 대상 유저의 `profiles.plan`을 `'free'`로 **service-role 클라이언트로만** 다운그레이드한다.
   - CRITICAL: 취소 유예 기간(구독이 기간 만료일까지 유효) 정책이 Polar에 있으면, "즉시 취소"와 "기간 말 만료"를 구분한다. 실제로 Pro 접근이 끝나는 시점의 이벤트(예: `revoked`/만료)에서 `'free'`로 내린다. 어떤 이벤트에서 다운그레이드할지 근거를 코드 주석/문서에 남긴다. (단순 정책: 종료 확정 이벤트에서 free.)

2. **멱등** — CRITICAL: step2와 동일. plan을 목표 상태(`'free'`)로 **set**하는 방식이라 재수신해도 결과가 동일해야 한다. 이미 `free`인 유저에 재적용해도 안전. ADR-007 단순 멱등만.

3. **서명 검증·service-role·에러 처리** — step2 규율을 그대로 상속한다. 서명 검증 없이/실패 시 다운그레이드 금지, service-role 이외 경로 금지, 내부 예외 원문 노출 금지, 성공 시 200.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(서명 검증·service-role 목킹): 유효 서명 + 구독 종료 이벤트가 대상 유저 `profiles.plan`을 service-role로 'free' 다운그레이드한다; **서명 검증 실패는 다운그레이드하지 않는다**; **동일 종료 이벤트 재수신이 멱등**이다; 다운그레이드가 웹훅 경로로만 일어나고 클라이언트 신호로는 불가하다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 다운그레이드가 **웹훅 단일 경로**(서명 검증 + service-role)로만 일어나는가? 클라이언트 취소 신호로 다운그레이드하는 경로가 없는가?
   - 어느 이벤트에서 `'free'`로 내리는지 근거가 명확한가(즉시 취소 vs 기간 말 만료 구분)?
   - 종료 이벤트 재수신이 멱등인가? 성공 시 200인가?
   - service-role 이외 경로로 plan을 바꾸지 않는가? 내부 예외 원문이 노출되지 않는가?
3. 결과에 따라 `phases/5-payment/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "취소·만료 웹훅→service-role free 다운그레이드·멱등·다운그레이드 트리거 이벤트 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 구독 취소/만료를 **클라이언트 신호**로 처리해 다운그레이드하지 마라. 이유: plan 진실원천은 Polar 웹훅으로 갱신된 `profiles.plan`.
- 서명 검증 없이 다운그레이드하거나, service-role 이외 경로로 plan을 바꾸지 마라. 이유: 위조 방지·service-role 용도 제한.
- 취소/만료 처리를 위해 별도 엔드포인트를 새로 만들지 마라(step2 웹훅 라우트를 확장). 이유: plan 갱신 단일 경로 유지.
- 종료 이벤트 재수신을 비멱등으로 처리하지 마라. 이유: ADR-007 단순 멱등·재시도 안전.
- 내부 예외 원문을 응답으로 내보내지 마라. 이유: 정보노출 방지.
- 기존 테스트를 깨뜨리지 마라.
