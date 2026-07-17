# 배포 및 실연동 설정

실제 값은 저장소에 커밋하지 않고 Vercel 프로젝트의 Production 환경변수에만 등록한다. `.env.example`은 키 이름과 플레이스홀더만 제공한다. 서버 전용 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 이 접두사가 붙은 값은 클라이언트 번들에 포함될 수 있다.

## 시크릿 및 환경변수 체크리스트

| 키 이름 | 공개/서버 | 발급처 | 소비 파일/기능 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 가능 | Supabase Dashboard → Project Settings → API의 Project URL | `src/lib/supabase/server-client.ts`, `src/middleware.ts`, `src/app/login/LoginClient.tsx` — 사용자 범위 Auth·DB 연결 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 가능(anon) | Supabase Dashboard → Project Settings → API의 anon key | `src/lib/supabase/server-client.ts`, `src/middleware.ts`, `src/app/login/LoginClient.tsx` — RLS가 적용된 사용자 범위 접근 |
| `NEXT_PUBLIC_SITE_URL` | 공개 가능(비밀 아님) | 배포된 FinSight Production origin | `src/app/api/checkout/route.ts` — Polar checkout 성공·취소 반환 URL 생성 |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용 시크릿** | Supabase Dashboard → Project Settings → API의 service-role key | `src/lib/supabase/service-role-client.ts`, Polar 웹훅 — `profiles.plan` 갱신에만 사용 |
| `ANTHROPIC_API_KEY` | **서버 전용 시크릿** | Anthropic Console (`console.anthropic.com`) | `src/lib/llm/client.ts`, `src/services/live/llm.ts` — 컬럼 매핑과 Free/Pro 분석 |
| `POLAR_ACCESS_TOKEN` | **서버 전용 시크릿** | Polar 조직 설정의 API access token | `src/lib/polar/client.ts`, `src/app/api/checkout/route.ts` — 서버 checkout 생성 |
| `POLAR_WEBHOOK_SECRET` | **서버 전용 시크릿** | Polar webhook endpoint 설정의 signing secret | `src/app/api/webhooks/polar/route.ts` — 웹훅 서명 검증 |
| `POLAR_PRODUCT_ID` | 서버 전용 설정 | Polar product catalog의 Pro product ID | `src/app/api/checkout/route.ts` — checkout 대상 상품 지정 |
| `DATA_SOURCE` | 서버 전용 설정 | 직접 설정 (`mock` 또는 `live`) | `src/lib/env.ts`, `src/services/index.ts`, `src/middleware.ts` — mock/live 구현 선택; 기본값은 `mock` |

`NEXT_PUBLIC_*` 값은 공개되어도 되는 설정만 사용한다. 특히 `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`에는 절대 이 접두사를 붙이지 않는다.

## OAuth 설정

Supabase 프로젝트를 만든 뒤 Site URL을 Production origin으로 설정하고 `/auth/callback`으로 돌아오는 URL을 허용 목록에 등록한다. 로컬 검증이 필요하면 로컬 origin의 동일 경로도 별도로 등록한다.

### Google

1. Google Cloud Console에서 OAuth 앱과 client ID/client secret을 발급한다.
2. Supabase Auth Dashboard의 기본 Google provider에 client ID와 client secret을 등록한다.
3. Google OAuth 앱에는 Supabase가 안내하는 provider callback URL을 authorized redirect URI로 등록한다.
4. Supabase URL Configuration에는 FinSight의 `https://<production-origin>/auth/callback`을 redirect URL로 등록한다. 애플리케이션은 로그인 후 이 경로에서 auth code를 교환한다.

### Kakao

카카오는 이 프로젝트 결정상 Supabase 기본 provider가 아니라 **커스텀 OIDC provider**로 연결한다.

1. Kakao Developers에서 애플리케이션을 만들고 OIDC를 활성화한다.
2. client ID/client secret과 issuer/discovery endpoint를 확보한다.
3. Supabase Auth의 커스텀 OIDC 슬롯에 issuer/discovery 정보와 client 자격 증명을 등록한다.
4. Kakao Developers에는 Supabase가 안내하는 provider callback URL을 redirect URI로 등록한다.
5. Supabase URL Configuration에는 FinSight의 `https://<production-origin>/auth/callback`을 redirect URL로 등록한다.

OAuth client secret은 provider/Supabase 콘솔에만 저장하며 `NEXT_PUBLIC_*` 또는 저장소 파일에 넣지 않는다.

## Vercel 환경변수 등록

Vercel 프로젝트의 Production 환경에 위 표의 모든 키를 등록한다. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`만 클라이언트에 노출 가능한 설정이며 나머지는 서버 전용이다.

첫 배포에서는 `DATA_SOURCE=mock`을 유지한다. Supabase 스키마·RLS·비공개 Storage, Anthropic, Polar, OAuth 설정을 검증한 뒤에만 `live`로 바꾼다. 환경변수 변경은 새 배포에 반영되므로 전환 후 재배포한다.

## 실연동 전환 순서

1. `DATA_SOURCE=mock` 상태로 Production에 배포한다.
2. Supabase 프로젝트와 Google/Kakao OAuth를 설정하고 모든 공개 설정·서버 시크릿을 Vercel Production 환경에 등록한다.
3. RLS 사용자 범위 접근, 비공개 Storage와 signed URL, Anthropic 호출, Polar checkout·웹훅 설정을 검증한다.
4. `DATA_SOURCE=live`로 전환한다.
5. 배포 스크립트는 변경하지 않고 재배포한다.
6. Step 3의 Production 스모크 테스트를 수행한다.

## 보안 주의사항

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회할 수 있으므로 **검증된 Polar 웹훅이 `profiles.plan`을 갱신할 때만** 사용한다.
- 사용자 거래·업로드·프로필 데이터는 사용자 JWT 컨텍스트의 RLS user-scoped Supabase 클라이언트로 접근한다.
- 업로드 CSV는 공개 버킷에 두지 않는다. 비공개 Storage에 저장하고 제한된 signed URL로만 접근한다.
- 실제 env 파일, OAuth client secret, API 키를 Git에 추가하지 않는다. 키 노출이 의심되면 즉시 발급처에서 폐기·교체한다.
