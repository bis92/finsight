# Step 0: polar-checkout

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (외부 API 호출은 서버에서만 · 시크릿 server-only `NEXT_PUBLIC_` 금지 · plan 진실원천=Polar 웹훅으로 갱신된 `profiles.plan` · 내부 예외 노출 금지)
- `/docs/ADR.md` (ADR-007 결제=Polar MoR·실결제 phase 1·통화 리스크·단순 멱등 / ADR-001 Route Handler로 외부 API 격리)
- `/docs/PRD.md` (핵심 기능 6: 결제 업그레이드 · Pro 앵커 · 가격 ₩9,900/월)
- `/docs/ARCHITECTURE.md` ("환경변수" 절 — 서버 전용 env 구분 · Route Handler 단일 진입점)
- `/src/lib/env.ts` (기존 `getDataSource` 서버 전용 env 헬퍼 — 이 파일에 Polar env 접근자를 추가하거나 동일 패턴을 따른다)
- `/src/lib/auth/session.ts` (`getAuthenticatedUserId` — 인증 유저 식별. 2-auth 산출물)
- `/src/lib/supabase/server-client.ts` (user-scoped Supabase 클라이언트 — customer 매핑 조회에 필요 시)
- `/src/types/plan.ts` (`Plan`·`Profile`의 `polarCustomerId`/`polarSubscriptionId`)
- `/src/app/api/_lib/server.ts` (기존 `withErrorBoundary` 등 라우트 공통 유틸 — 있으면 재사용)

이전 코드(env 접근자·인증 헬퍼·라우트 공통 유틸)를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라.

## 배경 (phase 1~6 전체 맥락)

mock-first(ADR-008)로 완성된 `0-mvp`를 실연동으로 교체하는 phase 중 하나다. `DATA_SOURCE=live` 컷오버는 마지막 `6-launch`에서 한 번만 한다. 이 phase(5-payment)는 mock 동작을 유지한 채 실결제(Polar) 인프라와 라우트만 추가한다. 테스트는 실제 Polar API가 아니라 **Polar SDK를 목킹한 단위 테스트**로 검증한다. 이 step은 그 토대인 Polar SDK 클라이언트와 checkout 세션 생성 라우트를 만든다.

## 작업

### 1. `src/lib/polar/client.ts` — Polar SDK 클라이언트 (server-only)

- 파일 최상단에 `import 'server-only'`를 두어 클라이언트 번들 유입을 차단한다.
- 서버 전용 env를 읽는 접근자를 둔다(또는 `src/lib/env.ts`에 추가):
  - `getPolarAccessToken(): string` — `process.env.POLAR_ACCESS_TOKEN`. 없으면 throw.
  - `getPolarWebhookSecret(): string` — `process.env.POLAR_WEBHOOK_SECRET`. 없으면 throw. (검증은 step2에서 쓰지만 접근자는 여기서 정의)
- `getPolarClient()` — Polar SDK(`@polar-sh/sdk`)의 클라이언트 인스턴스를 access token으로 생성해 반환. 인스턴스는 모듈 스코프에서 지연 생성(싱글턴)해도 되나 env 미설정 시 import 시점이 아니라 호출 시점에 throw하도록 한다.
- 시그니처 수준만 정의한다. Polar 상품/가격 ID 등 계정 의존 값은 env(`POLAR_PRODUCT_ID` 등)로 주입하고 하드코딩하지 않는다.
- CRITICAL: 이 모듈은 **서버에서만** import된다. `NEXT_PUBLIC_` 접두사 env를 쓰지 마라. 이유: access token 유출.

### 2. `src/app/api/checkout/route.ts` — checkout 세션 생성 (`POST /api/checkout`)

- 인증된 유저에 한해 Polar checkout 세션을 생성하고 **checkout URL을 반환**한다.
- 로직(시그니처 수준):
  1. `getAuthenticatedUserId()`로 현재 유저를 식별한다. 미인증이면 401 + 인증 유도 message.
  2. `getPolarClient()`로 checkout 세션을 생성한다. 파라미터:
     - 상품/가격: env(`POLAR_PRODUCT_ID`)에서 읽는다(클라이언트 body의 상품/가격/금액을 신뢰하지 마라).
     - `success_url` / `cancel_url`: 서버가 자기 앱의 절대 URL(예: `/pro?checkout=success` · `/pro?checkout=cancel`)로 구성한다. base URL은 서버 env(`NEXT_PUBLIC_SITE_URL` 등 공개 가능한 것)로.
     - `customer` 매핑: 유저의 `polarCustomerId`가 있으면 재사용, 없으면 Polar가 생성. **웹훅이 나중에 이 유저와 매핑을 확정**하도록 `metadata`/`customer_external_id`에 우리 `userId`를 실어 보낸다(step2에서 이 값으로 유저를 찾는다). 이유: 웹훅에서 어떤 유저의 plan을 갱신할지 식별하려면 세션 생성 시 우리 userId를 Polar 이벤트에 심어야 한다.
  3. 생성된 세션의 checkout URL을 `{ url }` 형태 JSON으로 반환한다.
- CRITICAL: 모든 Polar 호출은 이 Route Handler(서버)에서만 한다. 클라이언트가 Polar SDK를 직접 호출하는 경로를 만들지 마라. 이유: CLAUDE.md — 외부 API는 서버에서만, 시크릿 server-only.
- CRITICAL: 이 라우트는 **plan을 변경하지 않는다**. checkout URL만 발급한다. 실제 plan 갱신은 결제 완료 후 Polar 웹훅(step2)이 수행한다. 이유: plan 진실원천은 웹훅으로 갱신된 `profiles.plan`.
- 에러 처리: 내부 예외(Polar SDK 원문·스택)를 응답 body로 노출하지 마라. 5xx는 일반 문구로 덮고 상세는 `console.error`로만. 단, 의도된 검증/인증 message("로그인이 필요합니다" 등)는 그대로 노출한다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(Polar SDK·인증 헬퍼 목킹): 미인증 요청이 401로 거부된다; 인증 요청이 Polar checkout 생성을 호출하고 `{ url }`을 반환한다; checkout 파라미터에 우리 `userId`(metadata/external_id)가 실린다; 라우트가 `profiles.plan`을 변경하지 않는다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - Polar 호출이 서버(Route Handler)에서만 일어나는가? 클라이언트 직접 호출 경로가 없는가?
   - `POLAR_ACCESS_TOKEN`/`POLAR_WEBHOOK_SECRET`이 server-only로만 읽히고 `NEXT_PUBLIC_` 접두사가 없는가? `client.ts`에 `import 'server-only'`가 있는가?
   - 상품/가격이 서버 env에서 오고 클라이언트 body를 신뢰하지 않는가?
   - checkout 라우트가 plan을 변경하지 않고 URL만 반환하는가?
   - checkout 세션에 우리 `userId`가 metadata/external_id로 심어졌는가(웹훅 유저 매핑용)?
   - 내부 예외 원문이 응답으로 노출되지 않는가?
3. 결과에 따라 `phases/5-payment/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "Polar SDK 클라이언트·checkout 라우트 요약(server-only env·userId 매핑 심기 방식 포함)"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 클라이언트 컴포넌트에서 Polar SDK를 직접 호출하지 마라. 이유: 외부 API는 서버에서만, access token 유출 방지.
- `POLAR_ACCESS_TOKEN`/`POLAR_WEBHOOK_SECRET`에 `NEXT_PUBLIC_` 접두사를 붙이거나 클라이언트로 노출하지 마라. 이유: 시크릿 server-only.
- 이 라우트에서 `profiles.plan`을 직접 'pro'로 바꾸지 마라. 이유: plan 진실원천은 결제 완료 웹훅(step2)이다. checkout URL 발급만 한다.
- 클라이언트가 보낸 상품/가격/금액/plan 값을 신뢰해 세션을 만들지 마라. 이유: 위조·무단 가격 조작 방지.
- 내부 예외(Polar SDK·스택) 원문을 응답 body로 내보내지 마라(의도된 검증/인증 message 제외). 이유: 정보노출 방지.
- 기존 테스트를 깨뜨리지 마라.
