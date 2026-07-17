# Step 2: webhook-plan-sync

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: plan 진실원천=Polar 웹훅으로 갱신된 `profiles.plan` · `SUPABASE_SERVICE_ROLE_KEY`는 **Polar 웹훅 plan 갱신에만** · 시크릿 server-only · 내부 예외 노출 금지 · 클라이언트 plan 불신)
- `/docs/ADR.md` (ADR-007 결제=Polar MoR·plan 진실원천·**단순 멱등**만·웹훅 순서 뒤섞임은 MVP 밖 / ADR-002 service-role 오남용 방지)
- `/docs/ARCHITECTURE.md` ("환경변수" 절 · 데이터 모델 profiles.plan·polar_subscription_id·polar_customer_id)
- Step 0 산출물: `phases/5-payment/step0.md` → `src/lib/polar/client.ts`(`getPolarWebhookSecret`) · checkout에서 `metadata`/`customer_external_id`에 심은 우리 `userId`
- `src/lib/supabase/service-role-client.ts` (service-role Supabase 클라이언트 — plan 갱신 전용. 1-supabase 산출물. 이 파일 헤더/제약을 반드시 확인)
- `/src/types/plan.ts` (`Plan`·`Profile`의 `polarSubscriptionId`/`polarCustomerId`)
- `/src/app/api/checkout/route.ts` (step0 — 세션에 userId를 어떻게 심었는지 확인해 웹훅에서 동일 키로 조회)

service-role 클라이언트의 사용 제약(plan 갱신 전용)과 checkout에서 심은 userid 매핑을 꼼꼼히 읽고 작업하라.

## 배경

Polar에서 결제/구독 이벤트가 발생하면 웹훅으로 통지한다. 이 웹훅이 **plan의 유일한 진실 원천**이다. 클라이언트나 checkout 라우트가 아니라 이 엔드포인트만 `profiles.plan`을 갱신한다. 서명 검증으로 위조를 막고, service-role 클라이언트로 RLS를 우회해 대상 유저의 profile을 갱신한다(service-role은 이 용도로만 존재).

## 작업

### `src/app/api/webhooks/polar/route.ts` — Polar 웹훅 수신 (`POST /api/webhooks/polar`)

1. **원문 body 확보 + 서명 검증** — CRITICAL: 서명 검증 전에는 어떤 갱신도 하지 마라.
   - 요청의 **raw body**(파싱 전 텍스트)와 Polar 서명 헤더를 읽는다. Next.js Route Handler에서 `await req.text()`로 원문을 얻는다(파싱된 JSON으로 서명 검증하면 안 됨 — 바이트가 달라짐).
   - `getPolarWebhookSecret()`으로 Polar SDK/유틸의 서명 검증(`validateEvent` 등)을 수행한다. 검증 실패면 **401**을 반환하고 즉시 종료(로그만, 상세 노출 금지).
   - CRITICAL: 서명 검증 없이 plan을 갱신하지 마라. 이유: 위조 요청으로 무단 업그레이드가 가능하다.

2. **이벤트 분기 + 유저 식별**
   - 결제/구독 활성화 계열 이벤트(예: `subscription.created`/`subscription.active`/`order.paid` 등 Polar 스키마에 맞는 활성 이벤트)에서 plan을 `'pro'`로 올린다.
   - 대상 유저는 step0에서 checkout 세션에 심은 우리 `userId`(`metadata`/`customer_external_id`)로 식별한다. 없으면 `polar_customer_id`/`polar_subscription_id` 매핑으로 조회. 매핑을 못 찾으면 무단 갱신 대신 로그만 남기고 200 처리(재시도 방지) — 또는 명확한 4xx. **유저를 임의로 추정하지 마라.**
   - 갱신 시 `polar_customer_id`·`polar_subscription_id`도 함께 저장해 이후 이벤트(취소·만료; step3)에서 유저를 역추적할 수 있게 한다.

3. **service-role로만 갱신** — CRITICAL
   - `src/lib/supabase/service-role-client.ts`로 대상 유저의 `profiles.plan='pro'` + polar 식별자들을 update한다.
   - user-scoped 클라이언트나 다른 경로로 갱신하지 마라. service-role은 **오직 이 plan 갱신에만** 쓴다(CLAUDE.md·ADR-002).

4. **멱등 처리(단순)** — CRITICAL: 같은 이벤트를 재수신해도 안전해야 한다(Polar는 재시도한다).
   - 갱신을 **멱등 업서트**로 설계한다: 이미 `plan='pro'`(+동일 subscription_id)면 재적용해도 결과가 동일하도록 한다. plan 값을 목표 상태로 **set**하는 방식(누적/증가 아님)이면 자연히 멱등하다.
   - ADR-007대로 **단순 멱등만** 한다. 웹훅 순서 뒤섞임(out-of-order) 완전 대응이나 이벤트 저장소는 이 phase 범위 밖이다. 필요한 최소한(현재 상태로의 set + 안전한 재적용)만 구현한다.
   - 검증/성공 후에는 Polar에 **200**을 반환해 불필요한 재시도를 막는다(단, 서명 실패는 401).

5. **에러 처리** — 내부 예외(DB·SDK·스택) 원문을 응답 body로 노출하지 마라. 서명 실패는 401(상세 없이), 처리 중 서버 오류는 일반 문구 + `console.error`. Polar가 재시도할 수 있는 일시 오류는 5xx로, 재시도가 무의미한 경우(매핑 없음 등)는 200/4xx로 구분한다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(Polar 서명 검증·service-role 클라이언트 목킹): 유효 서명 + 활성 이벤트가 대상 유저 `profiles.plan`을 service-role로 'pro' 갱신한다; **서명 검증 실패 요청은 401이고 plan을 갱신하지 않는다**; **동일 이벤트 재수신 시 결과가 동일**(멱등)하다; 갱신이 service-role 경로로만 일어난다; 유저 매핑을 못 찾으면 임의 유저를 갱신하지 않는다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 서명 검증(`POLAR_WEBHOOK_SECRET`)을 **raw body**로 먼저 수행하고, 실패 시 어떤 갱신도 없이 401인가?
   - plan 갱신이 **service-role 클라이언트로만** 일어나는가? user-scoped/다른 경로 갱신이 없는가?
   - 대상 유저를 checkout에서 심은 userId(또는 polar 식별자 매핑)로만 식별하고 추정하지 않는가?
   - 동일 이벤트 재수신이 멱등(set 방식)인가? 성공 시 200을 반환하는가?
   - `POLAR_WEBHOOK_SECRET`이 server-only인가? 내부 예외 원문이 노출되지 않는가?
3. 결과에 따라 `phases/5-payment/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "Polar 웹훅 서명검증→service-role plan 갱신·멱등·유저 매핑 방식 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 서명 검증 없이(또는 검증 실패인데) `profiles.plan`을 갱신하지 마라. 이유: 위조 요청으로 무단 업그레이드가 가능하다.
- service-role 클라이언트를 plan 갱신 이외 용도로 쓰거나, plan 갱신을 user-scoped/다른 경로로 하지 마라. 이유: CLAUDE.md — service-role은 Polar 웹훅 plan 갱신에만, RLS 우회 오남용 방지.
- 파싱된 JSON으로 서명을 검증하지 마라(raw body 사용). 이유: 직렬화 차이로 검증이 깨진다.
- 클라이언트가 보낸 값이나 추정으로 대상 유저를 정하지 마라. 이유: 타인 plan 오염 방지.
- 이벤트 재수신을 비멱등으로 처리하거나, 순서 뒤섞임 완전 대응을 이 phase에서 구현하지 마라. 이유: ADR-007 — 단순 멱등만.
- `POLAR_WEBHOOK_SECRET`을 `NEXT_PUBLIC_`로 노출하거나 내부 예외 원문을 응답으로 내보내지 마라. 이유: 시크릿 server-only·정보노출 방지.
- 기존 테스트를 깨뜨리지 마라.
