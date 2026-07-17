# Step 4: upload-cap

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (구독 권한의 진실 원천=`profiles.plan`(Polar 웹훅 갱신) · 내부 예외 미노출·의도된 업무/권한 메시지는 노출 · service-role 용도 제한)
- `/docs/ADR.md` (**ADR-006** 과금=기능 깊이 + **Free 월 5회 안전장치**는 **live(phase 1)부터** 적용·mock phase 0 미적용 · **ADR-003** 매핑 LLM 비용)
- `/docs/PRD.md` (Free/Pro 기능 · Pro 무제한 · 페이월 UX)
- `/src/lib/env.ts` (`getDataSource()` — `'mock'|'live'` 스위치)
- `/src/app/api/uploads/route.ts` (업로드 라우트 — 상한 배선 지점 · `withErrorBoundary`·`ApiRouteError`·`CURRENT_USER_ID` 사용 패턴)
- `/src/app/api/_lib/server.ts` (`ApiRouteError(status, message)`·에러 바운더리·유저 식별)
- `/src/services/mock/profile.ts` 및 profile 서비스 (plan 조회 경로 — 상한은 plan을 참조)
- `/src/types/plan.ts` (`Plan`·`Profile.plan`)
- Step 0~3 산출물: `src/lib/llm/`·`src/services/live/llm.ts` (live 경로가 실제 LLM 비용을 발생시키는 지점)

이전 코드를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD 필수** — `lib/`의 순수 로직은 테스트를 먼저 작성하고 통과 구현을 쓴다(tdd-guard 강제).

Free 사용자의 **월 5회 업로드 상한**을 카운트/차단하는 로직을 만들고 업로드 라우트에 배선한다.

1. **`src/lib/upload-cap.ts`** — 상한 정책(순수 로직)
   - 상수: `FREE_MONTHLY_UPLOAD_CAP = 5`.
   - 판정 함수(순수, 부작용 없음) — 예:
     ```ts
     function isUploadAllowed(params: {
       plan: Plan
       uploadsThisMonth: number
     }): boolean
     ```
     - `plan === 'pro'` → 항상 허용(**Pro 무제한**).
     - `plan === 'free'` → `uploadsThisMonth < FREE_MONTHLY_UPLOAD_CAP`일 때만 허용.
   - "이번 달" 경계 계산도 여기서 결정론적으로 제공(예: 주어진 날짜 목록/타임스탬프에서 당월 카운트를 세는 헬퍼). **집계·판정은 코드**로 한다(LLM 무관).
   - 사용자에게 보일 **의도된 업무 메시지**(예: "이번 달 무료 업로드 5회를 모두 사용했습니다. Pro로 업그레이드하면 무제한입니다.")를 상수로 제공한다 — 이는 CLAUDE.md에서 노출을 허용하는 "의도된 업무/권한 메시지"다(내부 예외 아님).

2. **라우트 배선** — `src/app/api/uploads/route.ts`
   - **live에서만 적용**: `getDataSource() === 'live'`일 때만 상한을 체크한다. mock(phase 0) 경로에는 카운팅/차단을 추가하지 마라(ADR-006 — LLM 비용이 실제 발생하는 live 시점에만).
   - plan은 **`profiles.plan`(서버 조회)**에서 가져온다 — 클라이언트가 보낸 plan 값을 신뢰하지 마라(CLAUDE.md CRITICAL). 유저의 당월 업로드 횟수는 서버(uploads 저장소/DB)에서 조회한다.
   - 상한 초과 시 **`ApiRouteError`로 명확한 상태코드 + 의도된 메시지**를 던진다(예: 402 Payment Required 또는 403 — 프로젝트 컨벤션에 맞춰 페이월 유도용 코드 선택). 이 메시지는 서버 `message` 그대로 노출된다(CLAUDE.md: 의도된 업무/권한 메시지는 노출). 내부 예외로 덮지 마라.
   - 배선 위치: 실제 삽입(`insertMany`)·업로드 처리 **이전**에 게이트한다(초과분이 비용/DB에 닿기 전에 차단).

3. **성격 명시(주석)** — 이 상한은 **수익 게이팅이 아니라 매핑/분석 LLM 비용 폭주 방지용 안전장치**이며 live부터 적용된다는 근거(ADR-006)를 파일/라우트 주석에 남긴다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소:
  - `isUploadAllowed`: Pro는 카운트와 무관하게 허용, Free는 `< 5`에서 허용·`>= 5`에서 차단.
  - 당월 카운트 헬퍼가 다른 달의 업로드를 세지 않는다(월 경계).
  - (라우트 테스트) `DATA_SOURCE='live'` + Free + 당월 5회 도달 시 업로드가 차단되고 의도된 메시지가 응답 `message`에 노출됨. Pro는 무제한.
  - (라우트 테스트) `DATA_SOURCE='mock'`에서는 상한이 적용되지 않음(기존 mock 업로드 동작 불변).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 상한이 **live에서만** 적용되고 mock/phase0 경로는 불변인가(ADR-006)?
   - plan을 `profiles.plan`(서버)에서 읽고 클라이언트 값을 신뢰하지 않는가(CLAUDE.md CRITICAL)?
   - Pro 무제한 · Free 월 5회 규칙이 정확한가?
   - 초과 응답이 의도된 업무 메시지를 그대로 노출하고(허용), 내부 예외는 노출하지 않는가?
   - 판정/카운트가 코드로 계산되는가?
3. 결과에 따라 `phases/4-llm/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "upload-cap 정책·라우트 배선·live-only 적용 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- mock(phase 0) 경로에 카운팅/차단을 추가하지 마라. 이유: ADR-006 — MVP 단순성·LLM 비용은 live에서만 발생.
- 클라이언트가 보낸 plan 값으로 상한을 해제하지 마라(`profiles.plan`만 신뢰). 이유: CLAUDE.md CRITICAL — 셀프 업그레이드 차단.
- 상한 초과 메시지를 일반 5xx 문구로 덮지 마라(의도된 업무 메시지는 그대로 노출). 이유: CLAUDE.md — 페이월 UX·의도된 권한 메시지.
- Pro에 업로드 상한을 걸지 마라(무제한). 이유: ADR-006 — Pro는 업로드·분석 무제한.
- 카운트/월 경계를 LLM으로 계산하지 마라(코드로). 이유: 집계·판정은 코드.
- 테스트 없이 구현부터 쓰지 마라. 이유: TDD 강제.
- 기존 테스트를 깨뜨리지 마라.
