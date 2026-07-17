# Step 1: env-secrets

## 읽어야 할 파일

먼저 아래 파일들을 읽고, 실연동에 필요한 시크릿·발급처·서버/공개 구분을 파악하라:

- `/CLAUDE.md` (시크릿은 서버 전용 env · `NEXT_PUBLIC_` 금지 규칙 · service-role은 Polar 웹훅 plan 갱신에만)
- `/docs/ARCHITECTURE.md` ('환경변수' 절 — 공개/서버 전용 구분, '배포' 절 — 시크릿 등록 + `DATA_SOURCE=live` 전환)
- `/docs/ADR.md` (ADR-002 카카오 커스텀 OIDC + 구글 OAuth, ADR-007 Polar, ADR-003 Anthropic)
- Step 0: `src/services/index.ts` (live 배선이 요구하는 시크릿의 소비 지점)
- 참조: `src/lib/env.ts` (env 읽기 헬퍼)

이 step은 **문서/체크리스트만** 만든다. 실제 키 발급·프로젝트 생성·OAuth 앱 등록·Vercel 등록은 사용자 개입 영역이다.

## 이 step은 blocked가 정상이다

실 시크릿 발급·Supabase 프로젝트 생성·카카오/구글 OAuth 앱 등록·Vercel 환경변수 등록은 **에이전트가 수행할 수 없다**(외부 콘솔·계정 소유자 개입 필요). 따라서:
1. 아래 '작업'의 문서/`.env.example`를 **먼저 만든다**(이건 에이전트가 완결 가능).
2. 그다음 실제 시크릿 등록이 필요하면 `status=blocked`로 전환하고, `blocked_reason`에 **등록이 필요한 시크릿·설정 목록**을 구체적으로 적은 뒤 중단한다.

## 작업

실연동에 필요한 모든 env를 두 산출물로 문서화한다:

1. **`.env.example`** (프로젝트 루트) — 실제 값 없이 **키 이름 + 한 줄 주석(발급처·서버/공개 여부)** 만. 실제 시크릿 값을 절대 넣지 마라(플레이스홀더만).
   - 공개 가능(`NEXT_PUBLIC_`, anon만):
     - `NEXT_PUBLIC_SUPABASE_URL` — Supabase 프로젝트 URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon 공개 키(RLS로 보호)
   - 서버 전용(절대 `NEXT_PUBLIC_` 금지):
     - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role 키. **Polar 웹훅 plan 갱신에만** 사용(CLAUDE.md)
     - `ANTHROPIC_API_KEY` — Claude API 키(console.anthropic.com)
     - `POLAR_ACCESS_TOKEN` — Polar 서버 API 토큰
     - `POLAR_WEBHOOK_SECRET` — Polar 웹훅 서명 검증 시크릿
   - 스위치:
     - `DATA_SOURCE` — `mock`|`live`. 기본 `mock`. 실연동 전환은 이 값을 `live`로.
   - CRITICAL: 서버 전용 키에 `NEXT_PUBLIC_` 접두사를 붙이지 마라. 이유: CLAUDE.md — 클라이언트 번들에 시크릿이 노출된다.

2. **`docs/DEPLOYMENT.md`** — 시크릿 체크리스트 + OAuth 설정 절차 + 전환 순서. 최소 아래 구조:
   - **시크릿 체크리스트 표**: 각 env에 대해 `키 이름 | 공개/서버 | 발급처 | 어디서 소비되는가(파일/기능)`.
   - **OAuth 설정(ADR-002)**:
     - 구글: Supabase Auth 대시보드 기본 provider로 등록(client id/secret은 Google Cloud Console에서 발급). Redirect/callback URL(`/auth/callback`) 등록.
     - 카카오: Supabase 기본 provider가 아님 → **커스텀 OIDC provider로 등록**. 카카오 developers에서 앱 생성·OIDC 활성화·client id/secret·issuer/discovery endpoint 확보 후 Supabase Auth의 커스텀 OIDC 슬롯에 등록. Redirect URL 등록.
   - **Vercel 환경변수 등록**: 위 모든 키를 Vercel 프로젝트 env(Production)로 등록. `NEXT_PUBLIC_*`만 클라이언트 노출, 나머지는 서버 전용. `DATA_SOURCE`는 처음엔 `mock`, 실연동 검증 후 `live`.
   - **전환 순서(배포 절 반영)**: mock 상태 배포 → 시크릿 등록 → `DATA_SOURCE=live`로 전환 → 재배포 → 스모크(step 3). 배포 스크립트(step 2)는 불변, 전환은 env로만.
   - **보안 주의**: service-role 키는 웹훅 plan 갱신에만. 유저 데이터 접근은 RLS user-scoped 클라이언트. 업로드 CSV는 비공개 Storage + signed URL.

3. **`.gitignore` 확인** — `.env`(실제 값)가 이미 무시되는지 확인. `.env.example`은 커밋 대상(플레이스홀더만이므로 안전). `.gitignore`가 `.env`를 이미 커버하면 수정 불필요.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 코드 변경이 없으므로 build/test는 회귀 방지 용도(기존 그대로 통과).
- `.env.example`에 실제 시크릿 값이 없는지(플레이스홀더만) 수동 확인. `git grep`으로 실키 패턴(`sk-ant`, service-role JWT 등)이 없는지 확인.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 서버 전용 키에 `NEXT_PUBLIC_`이 붙지 않았는가?
   - `.env.example`에 실제 시크릿 값이 없는가(플레이스홀더만)?
   - service-role 키 용도가 "Polar 웹훅 plan 갱신에만"으로 명시됐는가?
   - 카카오 커스텀 OIDC(ADR-002)·구글 OAuth 등록 절차가 문서에 있는가?
   - `DATA_SOURCE` 전환 순서(mock→시크릿 등록→live→재배포)가 명시됐는가?
3. 결과에 따라 `phases/6-launch/index.json`의 step 1을 업데이트한다:
   - 문서/`.env.example` 작성 완료 + 실 등록 불필요(이미 등록됨) → `"status": "completed"`, `"summary": "산출물 요약"`
   - 문서 작성 완료했으나 **실 시크릿 등록·OAuth 앱 등록·Vercel env 등록이 남음** → `"status": "blocked"`, `"blocked_reason": "등록 필요한 시크릿·설정 목록(예: SUPABASE_SERVICE_ROLE_KEY·ANTHROPIC_API_KEY·POLAR_*·카카오/구글 OAuth 앱·Vercel Production env)"` 후 중단
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`

## 금지사항

- `.env.example`이나 문서에 실제 시크릿 값을 적지 마라. 이유: 커밋 히스토리에 시크릿이 영구 노출된다.
- 서버 전용 시크릿에 `NEXT_PUBLIC_`을 붙이지 마라. 이유: CLAUDE.md CRITICAL — 클라이언트 번들 노출.
- 에이전트가 대신 키를 발급하거나 임의 값을 생성해 등록된 척하지 마라. 이유: 실 인프라는 사용자 개입 영역 → 정직하게 blocked.
- service-role 키를 유저 데이터 접근 용도로 문서화하지 마라. 이유: RLS 우회 위험, 용도는 웹훅 plan 갱신 한정.
- 기존 테스트를 깨뜨리지 마라.
