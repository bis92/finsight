# 앱 사이드바 + 계정·구독 상태 표시 — 설계

날짜: 2026-08-09
상태: 설계 확정 (구현 대기)

## 목적

로그인한 사용자가 앱 어디서나 (1) 현재 로그인 계정(이메일), (2) 구독 상태(Pro/free)를
확인하고, (3) 로그아웃·업그레이드·구독 관리를 할 수 있도록 좌측 사이드바 셸을 도입한다.

## 범위

- 기존 상단 가로 헤더(`TopNav`)를 **인증된 앱 페이지에서만** 좌측 사이드바(`AppShell`)로 대체.
  - 대상: `/dashboard`, `/upload`, `/upload/mapping`, `/pro`
  - 제외(그대로 유지): 랜딩 `/`, `/login` — 마케팅/공개 페이지.
- 다중 파일 병합, 알림, 검색 등 다른 기능은 이 스펙 범위 밖(YAGNI).

## 레이아웃 (AppShell)

- **데스크톱 (≥ lg)**: 좌측 고정 사이드바 + 우측 페이지 영역.
  - 상단: 워드마크(`finsight`, `/dashboard` 링크)
  - 네비게이션: 대시보드(`/dashboard`) · 파일 업로드(`/upload`) · Pro 리포트(`/pro`)
    - 현재 경로 활성 하이라이트(`usePathname`, prefix 매칭)
  - 하단(고정): 테마 토글 → 계정 블록
- **모바일 (< lg)**: 얇은 상단 바(햄버거 + 워드마크 + 테마 토글). 햄버거 → 드로어로 사이드바 슬라이드.
  기존 `SideView`(Drawer) 패턴/컴포넌트 재사용.

### 계정 블록 (사이드바 하단 고정)

로그인 상태:
- 이메일 (말줄임 처리)
- plan 배지: Pro = 강조(`Badge`), free = 중립
- 조건부 액션:
  - free → "Pro로 업그레이드" → `/pro` 링크
  - pro → "구독 관리" → Polar 고객 포털로 이동(아래 API)
- 로그아웃 버튼

미로그인 상태(계정 요약 401):
- "로그인" 링크(`/login`)만 노출 (이메일/로그아웃/액션 숨김)

## 데이터 & API

### GET /api/account (신규)

`{ email: string; plan: 'free' | 'pro' }` 반환.
- email: `supabase.auth.getUser()` (auth 계층)
- plan: `getProfileService()(userId)`
- 미인증 → 401 (기존 `withErrorBoundary`/`ApiRouteError` 규약)
- 기존 `/api/account`에는 `DELETE`만 있으므로 같은 파일에 `GET` 추가.

### POST /api/portal (신규)

Pro 구독 관리용 Polar 고객 포털 세션 발급.
- 인증 필요(미인증 401).
- `getProfileService()`로 `polarCustomerId` 조회.
  - 없으면 400 + 사용자 메시지("연결된 구독 정보를 찾을 수 없습니다").
- `getPolarClient().customerSessions.create({ customerId })` → `customerPortalUrl`
- `{ url: string }` 반환. 클라이언트가 해당 URL로 이동.
- 아키텍처 규칙 준수: Polar 호출은 서버에서만.

### 클라이언트 데이터 경로

- 신규 `src/queries/account/index.ts` → `useAccount()`
  - `apiClient.get('/api/account')`, 공용 `apiClient`/`ApiError` 경유(단일 경로 규약).
  - 401은 "미로그인"으로 해석해 계정 블록 분기.
- 기존 `/api/profile` + `useProfile`는 변경 없이 유지(Pro 게이팅 등 다른 소비자 보존).

### 로그아웃

- 클라이언트: 브라우저 supabase 클라이언트로 `auth.signOut()` (LoginClient와 동일 클라이언트)
  → react-query 캐시 무효화 → `/login`으로 이동.
- 새 라우트 불필요.

## 타입

- `types/`에 계정 요약 타입 추가: `type AccountSummary = { email: string; plan: Plan }`.
- `category`/`Plan` 등 기존 enum 재사용. 자유 문자열 금지 규약 유지.

## 에러 처리

- 5xx는 일반 문구로 덮고 상세는 서버 로그(기존 `withErrorBoundary` 규약).
- 의도된 검증/권한 메시지(401 미로그인, 400 구독정보 없음)는 서버 `message` 그대로 노출.
- 계정 요약 로딩 중 사이드바는 스켈레톤/플레이스홀더, 실패(비401)는 조용히 최소 표시.

## 테스트 (TDD — 구현 전 선작성)

1. `GET /api/account`: 이메일+plan 반환, 미인증 401, 5xx 문구 마스킹.
2. `POST /api/portal`: 포털 URL 반환, 미인증 401, `polarCustomerId` 없을 때 400.
3. `useAccount()`: 성공/401 분기(경량).
4. `AppShell`: 활성 nav 하이라이트, free=업그레이드 CTA / pro=구독 관리 렌더 분기,
   로그아웃 버튼이 `signOut` 호출, 미로그인 시 로그인 링크.
5. 회귀: 기존 `src/app/api/routes.test.ts`(신규 라우트 5xx 없음), 페이지 스모크.

## 파일 변경 요약

- 신규: `src/app/api/account/route.ts`(GET 추가), `src/app/api/portal/route.ts`,
  `src/queries/account/index.ts`, `AppShell`(+ 필요 시 하위 컴포넌트),
  각 테스트 파일, `types/`의 `AccountSummary`.
- 수정: `src/components/ui/layout.tsx`(AppShell 추가), `src/components/ui/index.ts`(export),
  `src/app/dashboard/page.tsx`·`src/app/upload/page.tsx`·`src/app/upload/mapping/page.tsx`·
  `src/app/pro/page.tsx`(`TopNav` → `AppShell`).
- 불변: 랜딩 `/`, `/login`, `/api/profile`, `useProfile`.

## 미해결/가정

- 구독 관리는 Polar **인증 고객 포털 세션**을 사용(정식 방식). 정적 링크 폴백은 채택하지 않음.
- 인증 라우팅 보호(미들웨어)는 현행 유지 — AppShell은 미로그인 상태도 graceful 처리.
