# 프로젝트: finsight

CSV(은행 거래내역 · 카드 명세서)를 업로드하면 LLM이 분석해 **개인 소비 인사이트**를 대시보드로 보여주는 핀테크 SaaS. 타겟은 개인 가계부/소비분석(B2C).

## 기술 스택
- Next.js 15 (App Router) — 풀스택 (페이지 + Route Handler)
- TypeScript (strict mode)
- Tailwind CSS
- Supabase — Auth · Postgres · Storage
- Claude API (`@anthropic-ai/sdk`) — CSV 컬럼 자동매핑 + 심화 인사이트
- Polar — 구독 결제 (Merchant of Record)
- Vitest — 테스트
- 배포: Vercel

## 아키텍처 규칙
- CRITICAL: 외부 API 호출(Claude / Polar / Supabase service-role)은 **서버(Route Handler 또는 Server Action)에서만** 한다. 클라이언트 컴포넌트에서 직접 호출 금지.
- CRITICAL: 시크릿(`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_WEBHOOK_SECRET`, `POLAR_ACCESS_TOKEN`)은 서버 전용 env로만 읽는다. `NEXT_PUBLIC_` 접두사를 붙이지 마라.
- CRITICAL: LLM 비용 통제 — CSV 전체 행을 LLM에 넣지 마라. **컬럼 매핑은 샘플 행(≤20)만** LLM에 보내고, 실제 거래 분류는 규칙 기반 + 배치로 처리한다. (이유: 수백~수천 행을 매 업로드마다 LLM에 통째로 넣으면 비용·지연이 폭증)
- CRITICAL: 구독 권한(plan)의 유일한 진실 원천은 **Polar 웹훅으로 갱신된 `profiles.plan`**이다. 클라이언트가 보낸 plan 값을 신뢰해 기능을 해제하지 마라.
- CRITICAL: mock 데이터는 `/api/*` 뒤의 repository(`services/`)에만 둔다. `queries`/컴포넌트에 mock을 직접 넣지 마라. 이유: phase 1 실연동 시 UI 코드가 불변이어야 한다.
- CRITICAL: 거래 금액은 **부호 없는 정수(KRW 원)** + `direction`('expense'|'income')으로 저장. 부호로 지출/수입을 표현하지 마라(파서별로 흔들려 집계가 깨진다).
- CRITICAL: `SUPABASE_SERVICE_ROLE_KEY`는 **Polar 웹훅 plan 갱신에만** 쓴다. 유저 데이터 접근은 RLS가 켜진 user-scoped 클라이언트로. 업로드 CSV는 비공개 Storage + signed URL.
- 환불·매입취소 거래는 `direction='income'`로 정규화(순지출 = 지출−환입). 해외 거래는 원화 청구액만 사용.
- MVP는 단일 파일 업로드. 다중파일 병합·중복감지는 로드맵(구현하지 마라).
- CRITICAL: 내부 예외(DB 에러·스택·서드파티 원문)를 사용자 메시지로 노출하지 마라. 5xx는 일반 문구로 덮고 상세는 서버 로그로만. (단, 의도된 검증/업무/권한 메시지는 서버 `message` 그대로 노출)
- `category`는 `types/`의 고정 enum만 사용(자유 문자열 금지). CSV 셀은 신뢰불가 입력으로 취급(프롬프트 인젝션 방어, 렌더 이스케이프 유지).
- 데이터 페칭은 `src/queries/<domain>` + react-query **단일 경로**(모두 `/api/*` 호출). 공용 `apiClient`/`ApiError`를 거친다.
- 시임 인터페이스는 `TransactionsRepository`·`LlmService` 2개만 형식화. uploads/profiles는 단순 함수.
- 컴포넌트는 `src/components/`, 타입은 `src/types/`, 외부 API 래퍼는 `src/services/`, 순수 로직/유틸은 `src/lib/`에 둔다.
- 읽기 전용 상세는 SideView(Drawer/Collapse), 입력/수정/생성은 Modal. (사용자 전역 규약)
- API 에러는 서버 응답 `message`를 그대로 노출한다. 상태코드→한글 치환 테이블 금지. (사용자 전역 규약)

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 통과하는 구현을 작성한다 (TDD). `lib/`·`services/`의 비즈니스 로직은 테스트 파일이 선행해야 한다(tdd-guard 훅이 강제).
- 커밋 메시지는 conventional commits (feat:, fix:, docs:, refactor:, chore:).

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # Vitest (CI 모드, watch 아님)
