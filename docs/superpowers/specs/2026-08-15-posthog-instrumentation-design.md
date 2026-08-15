# PostHog 계측 · 에러 트래킹 · 로깅 설계

- 작성일: 2026-08-15
- 대상: finsight (Next.js 15 App Router, Supabase 인증, React Query, Polar 결제)
- 상태: 설계 승인 완료, 구현 대기

## 1. 배경 & 목표

finsight 코드베이스에는 현재 PostHog가 전혀 연결돼 있지 않다(의존성·코드·env·instrumentation
파일·전 브랜치 모두 없음). PostHog 프로젝트/토큰은 별도로 준비돼 있다.

목표는 "사용자 전이(활성화 퍼널)"를 관리할 수 있도록 앱 전반에 **제품 분석 계측 +
에러 트래킹 + 로깅**을 처음부터 적재적소에 구축하는 것이다.

세 가지 질문에 답하는 것이 이 설계의 핵심이다.

1. **어떤 유저 데이터가 필요한가** — Person 속성 + 활성화 퍼널/행동 이벤트
2. **어떤 에러가 필요한가** — 클라이언트/서버 예외 캡처 + 핵심 실패 신호
3. **로깅이 적재적소에 있는가** — 서버 로깅을 일관되게 PostHog로 라우팅

## 2. 비목표 (YAGNI)

- 리버스 프록시(광고차단 우회)는 이번 범위에서 제외. 나중에 Next.js rewrites로 추가 가능.
- 세션 리플레이/히트맵/피처 플래그/실험은 이번 범위에서 제외(초기화만 가능하게 열어둠).
- A/B 테스트, 서버측 피처 플래그 부트스트래핑 제외.
- 배포 자체(Vercel 등)는 하지 않음. 환경변수 등록 **안내**만 제공.

## 3. 아키텍처 개요

```
클라이언트                                     서버
──────────                                    ──────
instrumentation-client.ts (posthog.init)       lib/analytics/server.ts (posthog-node)
  ├─ 자동 페이지뷰 + 자동캡처                       ├─ captureServerEvent(distinctId, ...)
  └─ 예외 자동 캡처                                └─ captureServerException(error, ctx)
        │                                              │
lib/analytics/client.ts (capture 헬퍼)                 │
lib/analytics/events.ts (이벤트명/타입 상수) ── 공유 ──┘
        │
components/analytics/PostHogUserSync.tsx
  └─ onAuthStateChange → identify / reset

app/error.tsx, app/global-error.tsx → posthog.captureException
lib/observability/logger.ts → console + PostHog 라우팅
```

distinct_id는 클라이언트·서버 모두 **Supabase user.id**로 통일해 프론트/백엔드 이벤트를
같은 사람에게 귀속시킨다.

## 4. 유저 데이터 (제품 분석)

### 4.1 Person 속성 (`identify` 시 설정)

| 속성 | 값 | 출처 |
|---|---|---|
| `email` | 사용자 이메일 | Supabase user |
| `plan` | `free` \| `pro` | 프로필/구독 상태 |
| `auth_provider` | `kakao` \| `google` | Supabase identity |
| `signup_at` | ISO 날짜 | Supabase `created_at` |
| `data_source` | `mock` \| `live` | 앱 환경 |

식별 가능한 값만 채우고, 없으면 생략한다(가짜/공유 리터럴 금지).

### 4.2 활성화 퍼널 이벤트

```
login_started → signed_in → upload_started → upload_completed
  → mapping_completed → transactions_saved → dashboard_viewed
  → pro_checkout_started → pro_activated(서버)
```

| 이벤트 | 계측 위치 | 주요 속성 |
|---|---|---|
| `login_started` | `app/login/LoginClient.tsx` (`login`) | `provider` |
| `signed_in` | `PostHogUserSync` (SIGNED_IN 최초) | `auth_provider` |
| `upload_started` | `app/upload/UploadClient.tsx` | `file_type`(pdf/csv) |
| `upload_completed` | `app/upload/UploadClient.tsx` | `row_count`, `duration_ms` |
| `mapping_completed` | `app/upload/mapping/MappingClient.tsx` | `mapped_roles` |
| `transactions_saved` | 저장 응답 처리 지점 | `transaction_count` |
| `dashboard_viewed` | `app/dashboard/DashboardClient.tsx` | `period`, `is_guest` |
| `pro_checkout_started` | Pro/checkout 시작 지점 | — |
| `pro_activated` | `app/api/webhooks/polar/route.ts` (서버) | `plan`, `source=polar` |

`transactions_saved`의 정확한 클라이언트 훅 지점은 업로드/매핑 저장 흐름을 구현 시 확정한다.

### 4.3 행동 이벤트

| 이벤트 | 위치 | 비고 |
|---|---|---|
| `insights_viewed` | 대시보드/인사이트 조회 | — |
| `pro_report_generated` | `app/pro/ProReportClient.tsx` | Pro 리포트 생성 |
| `pro_insights_degraded` | `api/_lib/server.ts` `proInsightsWithFallback` | AI 폴백 발생 신호 |
| `account_deleted` | `api/account/route.ts` | 이탈 분석 |

### 4.4 자동 계측

`posthog.init(..., { defaults: '2026-05-30' })`로 SPA 네비게이션 포함 페이지뷰 +
자동캡처를 활성화한다.

## 5. 에러 트래킹

### 5.1 클라이언트

- `instrumentation-client.ts`에서 예외 자동 캡처 활성화.
- `app/error.tsx`(라우트 세그먼트 바운더리) 신규 — `posthog.captureException(error, { digest })`
  후 사용자용 폴백 UI 렌더.
- `app/global-error.tsx`(루트 바운더리) 신규 — 최상위 렌더 오류 캡처.

### 5.2 서버 (단일 관문)

`api/_lib/server.ts`의 `withErrorBoundary`가 모든 API 예외를 잡는 유일한 관문이다.

- **예상된 오류**(`ApiRouteError`, 4xx): 캡처하지 않음 → 노이즈 방지.
- **예기치 못한 오류**(500): `captureServerException(error, ctx)`로 posthog-node 캡처.
  - `ctx`: `distinctId`(가능하면 현재 유저 id), `route`, `method`.
  - 기존 `console.error(error)`는 유지(로컬 가시성).

### 5.3 핵심 실패 신호 (기존 console 지점 라우팅)

| 지점 | 처리 |
|---|---|
| `app/auth/callback/route.ts` OAuth 실패(3곳) | 예외 캡처 + `login_failed` 이벤트 |
| `app/api/uploads/route.ts` 업로드 실패 | 예외 캡처 |
| `app/api/account/route.ts` 삭제 실패 | 예외 캡처(단계 정보 포함) |
| `app/api/webhooks/polar/route.ts` 매핑 누락(warn) | `warn` 로깅 라우팅(웹훅 흐름 유지) |

## 6. 로깅

얇은 서버 로거 `src/lib/observability/logger.ts` 신규.

- `logger.error(message, { error, ...ctx })` / `logger.warn(...)` API.
- 동작: 항상 `console.*` 출력(로컬 가시성) + PostHog로 라우팅(에러는 예외 캡처, warn은 이벤트).
- 기존 `console.error`/`console.warn` 17곳을 점진적으로 이 로거로 교체해 일관성 확보.
- 클라이언트에서는 사용하지 않음(서버 전용, `server-only` 불필요하나 서버 코드에서만 import).

## 7. 환경변수 & 배포

`.env.local`(로컬) + `.env.example`(문서화)에 추가:

```
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

- 서버 posthog-node도 동일 `NEXT_PUBLIC_` 토큰/호스트를 재사용한다.
- 서버측 env 접근이 필요하면 `src/lib/env.ts`에 `getPosthogToken()`/`getPosthogHost()` getter 추가.
- **배포**: Vercel 등 호스팅 프로젝트 환경변수에 위 두 값을 등록하도록 **안내만** 제공(직접 배포 X).

### 초기화 게이팅

- 토큰이 없으면 init을 건너뛴다(로컬 개발자 실수 방지).
- mock/개발 모드에서 실데이터 오염을 막기 위해, 캡처는 기본적으로 토큰이 설정된 환경에서만
  동작한다. 로컬에서 강제 확인이 필요하면 토큰을 `.env.local`에 넣어 검증한다.

## 8. CSP 확인

PostHog SDK는 CDN에서 추가 번들을 lazy-load하고 이벤트를 ingestion 호스트로 보낸다.
finsight에 CSP가 설정돼 있으면(`next.config.ts`/`middleware.ts` 확인) 다음을 허용해야 한다.

```
script-src 'self' https://*.posthog.com;
connect-src 'self' https://*.posthog.com;
worker-src 'self' blob: data:;
```

구현 시 CSP 존재 여부를 먼저 확인하고, 있으면 위 규칙을 반영한다(없으면 조치 불필요).

## 9. 신규/수정 파일

**신규**
- `instrumentation-client.ts` — posthog.init
- `src/lib/analytics/client.ts` — 클라이언트 capture/identify/reset 헬퍼
- `src/lib/analytics/events.ts` — 이벤트명 상수 + 타입 정의(클라이언트/서버 공유)
- `src/lib/analytics/server.ts` — posthog-node 클라이언트 + `captureServerEvent`/`captureServerException`
- `src/components/analytics/PostHogUserSync.tsx` — onAuthStateChange identify/reset
- `src/app/error.tsx`, `src/app/global-error.tsx` — 클라이언트 에러 바운더리
- `src/lib/observability/logger.ts` — 서버 로거

**수정**
- `src/app/providers.tsx` — `<PostHogUserSync />` 마운트
- `src/app/api/_lib/server.ts` — `withErrorBoundary` 서버 예외 캡처
- 퍼널 클라이언트: `LoginClient.tsx`, `UploadClient.tsx`, `MappingClient.tsx`, `DashboardClient.tsx`, `ProReportClient.tsx`
- 서버 라우트: `webhooks/polar/route.ts`(pro_activated), `auth/callback/route.ts`, `api/uploads/route.ts`, `api/account/route.ts`
- `.env.local`, `.env.example`, (선택) `src/lib/env.ts`

**의존성**: `posthog-js`, `posthog-node`

## 10. 테스트 전략 (vitest, TDD)

- `src/lib/analytics/events.ts` — 이벤트명 상수/타입 계약 테스트.
- `src/lib/analytics/server.ts` — posthog-node 모킹, distinctId/shutdown 호출 검증.
- `src/lib/observability/logger.ts` — console + PostHog 라우팅, warn/error 분기.
- `PostHogUserSync` — Supabase auth 이벤트 모킹, identify/reset 호출 검증.
- `withErrorBoundary` — `ApiRouteError`는 캡처 안 함, 500은 캡처함(기존 테스트 유지).
- 클라이언트 capture 호출은 posthog 싱글턴 모킹으로 스파이.

## 11. 롤아웃 & 검증

1. 로컬에서 토큰 설정 후 로그인→업로드→매핑→대시보드→Pro 흐름을 밟아 PostHog 활동
   피드에 이벤트/식별/예외가 도착하는지 확인.
2. 의도적 500 유발로 서버 예외 캡처 확인.
3. `npm run test`, `npm run lint`, `npm run build` 통과.
4. 배포 환경변수 등록 안내 제공.

## 12. 미해결/구현 시 확정 사항

- `transactions_saved`, `pro_checkout_started`, `insights_viewed`의 정확한 클라이언트
  훅 지점은 해당 흐름 구현 시 코드 확인 후 확정.
- CSP 존재 여부(§8) 구현 시 확인.
- `plan`(free/pro) 값의 정확한 소스(프로필 테이블 vs 구독 상태)는 구현 시 확정.
