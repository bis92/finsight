# Step 5: api-routes

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (외부 API는 서버에서만 · 내부 예외 노출 금지 · plan 진실원천 · category enum)
- `/docs/ARCHITECTURE.md` (데이터 흐름 단일 경로 · Route Handler는 모든 데이터 접근의 단일 진입점 · 데이터 모델)
- `/docs/ADR.md` (ADR-001 Route Handler, ADR-007 plan 게이팅)
- `/docs/PRD.md` (핵심 기능 · 비용 상한: LLM 호출 3회 이하)
- Step 1: `src/types/`
- Step 4: `src/services/` (팩토리 `getTransactionsRepository`/`getLlmService`/`getProfileService`/`getUploadsService`)

이전 step의 서비스 팩토리를 꼼꼼히 읽고, 데이터 흐름 계약을 이해한 뒤 작업하라.

## 작업

`src/app/api/`에 Route Handler를 만든다. 이들이 **모든 데이터 접근의 단일 진입점**이며, Step 4 서비스 팩토리만 호출한다(서비스 외 데이터 접근 금지).

라우트(경로·메서드는 REST 관례로, 아래는 최소 셋):

1. **`POST /api/uploads/mapping`** — CSV 업로드 매핑 요청. body의 headers+sampleRows(≤20)를 받아 `getLlmService().mapColumns()` 호출 → `ColumnMappingResult` 반환.
   - CRITICAL: 클라이언트가 sampleRows를 20개 초과로 보내도 서버에서 ≤20으로 잘라 LLM에 전달. 이유: LLM 비용 통제.
2. **`POST /api/uploads`** — 확정 매핑 + 파싱된 거래를 받아 `insertMany` (mock). `Upload` 상태 반환. (Phase 0은 실제 Storage 없음 — mock uploads 함수 사용.)
3. **`GET /api/transactions?from&to`** — `listByUser` → 거래 목록.
4. **`PATCH /api/transactions/:id`** — body `{ category }` 검증(Category enum만) → `reclassify`.
5. **`GET /api/insights?period`** — 서버에서 `listByUser`→`aggregate`(Step 3)→`getProfileService().getProfile`로 plan 조회→`generateInsights(agg, plan)`. Free/Pro 분기.
6. **`GET /api/analyses` (또는 `/api/pro-report`)** — Pro 지출 진단 리포트 + 구독 후보. 아래 게이팅 필수.
7. **`GET /api/profile`** — 현재 사용자 profile(plan 포함).

공통 규칙:

- **plan 게이팅(서버)** — Pro 전용 응답(6번 pro-report·구독후보)은 `getProfileService().getProfile()`의 `plan==='pro'`일 때만 데이터를 반환한다. Free면 402/403 등 상태 + 업그레이드 안내 `message`. CRITICAL: **클라이언트가 보낸 plan을 신뢰하지 마라**. 서버에서 조회한 `profiles.plan`만 신뢰. 페이월은 **데이터 레벨 차단**(빈 데이터/거부), CSS 블러 아님.
- **에러 처리** — CRITICAL: 내부 예외(DB·스택·서드파티 원문)를 사용자 메시지로 노출하지 마라. 5xx는 일반 문구(`{ message: '일시적인 오류가 발생했습니다' }` 등)로 덮고 상세는 `console.error`로만. 단, 의도된 검증/권한/업무 메시지(예: "카테고리가 유효하지 않습니다", "Pro 전용 기능입니다")는 그대로 노출한다.
- **입력 검증** — Category·Direction·날짜 등은 서버에서 enum/형식 검증(신뢰불가 입력). category가 enum 밖이면 400 + 검증 message.
- **Phase 0 인증** — 실제 Supabase Auth 없음. 현재 사용자 식별은 mock userId(예: 고정 데모 유저 또는 스텁 세션)로 처리하되, userId를 서버에서 결정하고 클라이언트가 임의 userId를 주입해 타인 데이터를 읽지 못하게 한다. (실제 JWT/RLS는 Phase 1.)
- LLM 호출은 기본 경로 3회 이하(mapColumns / insights / subscriptions)로 유지(PRD 비용 상한).

## Acceptance Criteria

```bash
npm run build
npm test        # 라우트 핸들러 단위 테스트(가능한 것) 통과
```

- 테스트 최소: pro-report가 Free plan에서 게이팅(빈/거부)되고 Pro에서 데이터 반환, PATCH transactions가 enum 밖 category를 400으로 거부, insights가 plan에 따라 분기.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 모든 데이터 접근이 Step 4 서비스 팩토리 경유인가(라우트에서 직접 외부 SDK 호출 없음)?
   - Pro 게이팅이 서버 조회 plan 기반인가(클라이언트 plan 불신)?
   - 5xx가 일반 문구로 덮이고 상세는 서버 로그만인가?
   - sampleRows ≤20 상한을 서버가 강제하는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "생성한 라우트 목록·게이팅/에러정책 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 라우트에서 서비스 팩토리를 우회해 외부 SDK를 직접 호출하지 마라. 이유: 단일 진입점 원칙.
- 클라이언트가 보낸 plan/userId를 신뢰해 권한/데이터를 해제하지 마라. 이유: CLAUDE.md CRITICAL 권한 진실원천.
- 내부 예외 원문을 응답 body로 내보내지 마라(의도된 검증/권한 message 제외). 이유: 정보노출 방지.
- 페이월을 CSS 블러로 처리하지 마라(데이터 레벨 차단). 이유: 우회 가능.
- 기존 테스트를 깨뜨리지 마라.
