# finsight — MVP 개발 플랜

> CSV(은행 거래내역·카드 명세서) 업로드 → LLM 분석 → 개인 소비 인사이트 대시보드. B2C 가계부/소비분석 핀테크 SaaS.
>
> 이 문서는 코드 착수 전 확정한 **계획의 단일 요약본**이다. 세부 규범은 `CLAUDE.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`, `docs/UI_GUIDE.md`에 있고, 실행 대본은 `phases/`에 있다. 상충 시 각 원본 문서가 우선한다.

## 1. 목표와 범위

- **제품:** 임의 CSV를 올리면 Claude가 컬럼을 자동 인식해 표준 스키마로 정규화하고, 소비 인사이트를 대시보드로 보여준다.
- **MVP 범위:** 랜딩 → (게스트 샘플 데모) → 로그인 → CSV 업로드/파싱 → Free 대시보드 → Pro 인사이트 → 결제 업그레이드 → 배포.
- **MVP 제외(로드맵):** 다중파일 병합·중복감지, 다월(MoM) 추이, PDF 리포트, 트래픽 대응(rate limit/스케일), 모바일 앱, i18n.

## 2. 기술 스택 (확정)

| 영역 | 선택 | 근거(ADR) |
| --- | --- | --- |
| 프레임워크 | Next.js 15 (App Router) 풀스택 | ADR-001 |
| 인증·DB·스토리지 | Supabase (Auth + Postgres + Storage, RLS) | ADR-002 |
| LLM | Claude API (`@anthropic-ai/sdk`), 얇은 추상화 | ADR-003 |
| 결제 | Polar (Merchant of Record, 구독) | ADR-004 |
| 테스트 | Vitest + @testing-library/react + jsdom | — |
| 배포 | Vercel | ADR-001 |

## 3. 핵심 제품 결정

- **과금 = 기능 깊이로 가름(횟수 제한 아님).** 명세서는 월 1회라 횟수 제한이 무의미.
  - **Free:** 사실 조회 — 파싱·집계, 카테고리별 지출, 상위 가맹점, 기본 차트, 순지출.
  - **Pro:** 해석·코칭 — 심화 LLM 인사이트 + **정기구독/반복결제 탐지 + 절감 제안**. (다월 추이·PDF는 출시 후)
  - Pro 앵커 2개: **심화 인사이트**, **정기구독 탐지**.
- **게스트 데모:** 가입 없이 샘플 fixture로 대시보드를 읽기전용 체험 → "내 파일로 해보기" CTA로 가입 유도.

## 4. 아키텍처 원칙

- **mock-first 시임:** mock 데이터는 `/api/*` 뒤 repository(`services/`)에만. `queries`/컴포넌트는 항상 실제 `/api` 호출. phase 1에서 repository 구현만 교체 → **UI 코드 불변**. `DATA_SOURCE=mock|live` 스위치.
- **형식화한 시임 인터페이스 2개:** `TransactionsRepository`, `LlmService`. uploads/profiles는 단순 함수.
- **데이터 페칭 단일 경로:** `src/queries/<domain>` + react-query, 공용 `apiClient`/`ApiError` 경유.
- **디렉토리:** 페이지 `src/app`, 컴포넌트 `src/components`, 페칭 `src/queries`, 외부 API 래퍼 `src/services`, 순수 로직 `src/lib`, 타입 `src/types`.

### 데이터 모델(요지)

- `profiles` — plan(진실 원천), Polar 웹훅으로만 갱신.
- `uploads` — 업로드 메타. 원본 CSV는 **비공개 Storage + signed URL**.
- `transactions` — 금액 = **부호 없는 정수(KRW)** + `direction`('expense'|'income') + `category`(고정 enum) + `raw` jsonb.
- `analyses` — user+기간 스코프 집계/인사이트.
- `subscriptions` — 정기결제 탐지 결과.

## 5. 보안 불변식 (CRITICAL)

- 외부 API 호출(Claude/Polar/Supabase service-role)은 **서버에서만**. 클라이언트 직접 호출 금지.
- 시크릿(`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_WEBHOOK_SECRET`, `POLAR_ACCESS_TOKEN`)은 서버 전용 env. `NEXT_PUBLIC_` 금지.
- `SUPABASE_SERVICE_ROLE_KEY`는 **Polar 웹훅 plan 갱신에만**. 유저 데이터는 RLS user-scoped 클라이언트로.
- 구독 권한의 유일한 진실 원천 = **`profiles.plan`**. 클라이언트가 보낸 plan 신뢰 금지(페이월은 데이터 레벨 차단, CSS 블러 아님).
- 내부 예외(DB 에러·스택·서드파티 원문)를 사용자에게 노출 금지. 5xx는 일반 문구, 상세는 서버 로그. (의도된 검증/권한 메시지는 서버 `message` 그대로)
- 에러 표시는 서버 응답 `message` 그대로. 상태코드→한글 치환 테이블 금지.
- CSV 셀은 신뢰불가 입력 — 프롬프트 인젝션 방어, 렌더 이스케이프 유지.

## 6. LLM 비용 통제 (CRITICAL)

- CSV 전체 행을 LLM에 넣지 않는다. **컬럼 매핑은 샘플 행(≤20)만** LLM에.
- 실제 거래 분류는 **규칙 기반 + 배치**로 처리.

## 7. CSV 정규화 규칙

- 인코딩: EUC-KR/CP949 감지 → `TextDecoder('euc-kr')` 디코드 후 Papaparse.
- 금액: 괄호/부호/콤마/"원" 등 파서별 변형을 정수(KRW)로 정규화, 부호 대신 `direction`.
- 환불·매입취소 = `direction='income'`으로 정규화(순지출 = 지출 − 환입). 해외 거래는 원화 청구액만.
- 매핑 확인 스텝 + 오분류 재분류(Modal, category enum 선택).

## 8. 유저 플로우 (7단계)

랜딩 → 게스트 샘플 데모(읽기전용) → 가입/로그인 → CSV 업로드 → 파싱·매핑 확인 → Free 대시보드(집계·상세 SideView·재분류 Modal) → Pro 인사이트/정기구독(페이월) → 결제 업그레이드.

> 시각 다이어그램(아트팩트): https://claude.ai/code/artifact/b2cf1077-b003-45b2-a110-6461dda44bb7

## 9. 엣지/에러 처리 결정 (E1–E8 요지)

- 빈 CSV/0 거래/깨진 행/BOM/내장 개행·따옴표/금액 0/괄호 음수/다양한 날짜포맷 → 파서 테스트로 강제(TDD).
- LLM 매핑 실패 → 폴백(사용자 수동 매핑). 부분 임포트 실패 → 성공분만 반영 + 안내.
- Pro 강등(해지/만료) → free로 돌아가되 **과거 데이터 열람 허용, 심화 기능만 잠금**(데이터 삭제 금지).
- 웹훅 → 서명 검증 + 단순 멱등(순서 뒤섞임 대응은 MVP 밖).

## 10. 개발 프로세스

- **TDD:** `lib/`·`services/` 비즈니스 로직은 테스트 파일 선행(tdd-guard 훅 강제).
- **하네스 실행:** `phases/`의 step 파일을 `scripts/execute.py`가 순차 실행. 각 step은 자기완결(읽을 파일·작업·AC·검증·금지사항). AC = `npm run lint && npm run build && npm run test`.
- 커밋: conventional commits.

## 11. 실행 계획 (Phase)

### Phase 0 — `0-mvp-ui` (mock 데이터로 전 화면) ← **현재**

| step | 이름 | 요지 |
| --- | --- | --- |
| 0 | project-setup | Next.js/TS/Tailwind/Vitest 부트스트랩, 3개 npm 스크립트 통과 |
| 1 | design-system | UI 프리미티브(Card/Drawer/Modal 등), 토큰 |
| 2 | domain-types-mocks | types + mock repository/LlmService |
| 3 | mock-auth | 스텁 인증(env 가드로 prod 유출 방지) |
| 4 | csv-parse-core | 인코딩/금액/날짜/환불 정규화 + 엣지 TDD |
| 5 | csv-upload-ui | 업로드 + 매핑 확인 스텝 |
| 6 | dashboard-free | Free 집계 대시보드(상세 SideView, 재분류 Modal) |
| 7 | pro-insights-ui | 심화 인사이트 + 정기구독 탐지 + 페이월(서버 게이팅) |
| 8 | billing-ui | 가격표 + mock 체크아웃(plan 서버 경로 전환) |
| 9 | landing-and-demo | 랜딩 + 게스트 샘플 데모(step6 재사용) |

실행: `python3 scripts/execute.py 0-mvp-ui`

### Phase 1 — `1-wire-up` (예정)

실 Supabase/Claude/Polar 연동 + 결제 + 배포. mock repository 구현만 교체(UI 불변). step 파일은 phase 0 실행 후 설계.

## 12. 현재 상태

**플랜 완료. 코드 0줄.** 스펙 5종 채움 완료, `phases/0-mvp-ui/` step0~9 생성 완료. Phase 0 실행 대기.
