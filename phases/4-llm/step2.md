# Step 2: insights-live

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (플랜별 모델: Free 분석=`claude-sonnet-4-6` / Pro 지출진단=`claude-opus-4-8` · 집계는 코드 · 금액은 부호없는 정수 KRW)
- `/docs/ADR.md` (**ADR-005** 집계는 코드·판단은 AI(구조화 JSON) · **ADR-003** 플랜별 모델·Opus 제약 · **ADR-006** 과금=기능 깊이)
- `/docs/PRD.md` (Free 요약 vs Pro 진단·절감제안 · 페이월)
- `/src/lib/analysis/index.ts` (`aggregate`가 만든 `AggregateSnapshot` — 숫자의 진실 원천)
- `/src/types/analysis.ts` (`AggregateSnapshot`·`Insight`·`InsightSegment`·`InsightKind` `'summary'|'diagnosis'|'suggestion'`·`savingKrw`)
- `/src/types/plan.ts` (`Plan` `'free'|'pro'`)
- `/src/services/types.ts` (`LlmService.generateInsights(agg, plan)` 시그니처)
- `/src/services/mock/llm.ts` (mock `freeInsights`/`proInsights` — live가 지켜야 할 **반환 타입/의미** 계약: Free=요약형 소수, Pro=진단+절감제안 다수, 평문 segments, 마크다운 금지)
- Step 0 산출물: `src/lib/llm/client.ts` (`SONNET`·`OPUS`·구조화 헬퍼)
- Step 1 산출물: `src/services/live/llm.ts` (같은 파일에 이어서 구현)

이전 코드를 꼼꼼히 읽고 시임 계약을 이해한 뒤 작업하라.

## 작업

**TDD 필수** — Anthropic SDK를 목킹해 단위테스트를 먼저 작성하고 통과 구현을 쓴다(실 API 호출 금지).

`src/services/live/llm.ts`에 live `generateInsights`를 추가한다.

1. **`generateInsights(agg: AggregateSnapshot, plan: Plan): Promise<Insight[]>`**
   - **플랜 분기(모델)**: `plan === 'pro'` → **`OPUS`**(`claude-opus-4-8`, 심화 지출 진단), 그 외 → **`SONNET`**(`claude-sonnet-4-6`, Free 요약 분석). ADR-003/006. 모델 선택은 이 함수 내부에 은닉.
   - **집계 숫자는 코드(`agg`) 결과를 근거로 넣고, LLM은 진단문·절감제안 텍스트 배열만 생성한다**(ADR-005). LLM에 계산을 시키지 마라 — `agg.totalExpense`/`byCategory[].amount`/`ratio`/`netExpense`/`topMerchants` 등 필요한 수치를 프롬프트에 **이미 계산된 값으로** 제공하고, 모델은 그 수치를 해석·서술하게 한다.
   - **구조화 JSON 출력**(step0 헬퍼, json_schema)으로 `Insight[]` 형태를 강제:
     - `title: string`, `kind: 'summary'|'diagnosis'|'suggestion'`, `segments: {text, emphasis}[]`(평문), `savingKrw?: number`(비음수 정수, `suggestion`에만).
     - Free: 요약형(`summary`) 소수(예: 1~2개). Pro: 진단(`diagnosis`) + 절감제안(`suggestion`) 다수. mock의 개수·kind 분포와 정합적으로.
   - **스키마 검증(코드로, 반환 전)**:
     - `kind`가 enum 밖이면 해당 Insight를 버리거나 안전 kind로 교정.
     - `segments`가 비었거나 `text`가 문자열이 아니면 정규화/제거.
     - `savingKrw`는 `suggestion`에서만 허용하고, **비음수 정수**로 강제(Math.round + 음수 클램프). 다른 kind의 `savingKrw`는 제거.
     - `text`에 마크다운/HTML 마크업이 섞여 오면 평문으로 취급(렌더에서 이스케이프 유지) — 최소한 반환 계약이 평문 segments임을 지킨다.
   - **빈 입력 안전성**: `agg`에 거래가 없을 때(모든 합계 0, 빈 배열) mock처럼 "분석할 내역 없음" 류의 안전한 Insight를 반환하거나, LLM 호출 없이 결정적 empty 결과를 반환해도 된다(불필요한 LLM 비용 회피).
   - **에러 처리**: 파싱/SDK 에러는 step0 헬퍼가 일반화해 던지므로 그대로 전파. 내부 예외 원문을 사용자 메시지로 노출하지 않는다(상세는 서버 로그).

2. **금액 규칙** — 금액은 부호 없는 정수 KRW로 다룬다. LLM이 반환한 `savingKrw`를 신뢰해 소수/음수를 통과시키지 마라(코드로 강제).

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(SDK 목킹, 실 네트워크 없음):
  - `plan==='pro'`면 호출 모델이 `OPUS`, `plan==='free'`면 `SONNET`.
  - Free/Pro가 서로 다른 개수/kind 분포의 `Insight[]`를 반환(Free=summary 위주 소수, Pro=diagnosis+suggestion 다수).
  - 목킹 응답이 스키마 밖(잘못된 kind, 음수/소수 `savingKrw`, 빈 segments)이어도 코드 검증으로 정규화/제거되어 유효한 `Insight[]`만 반환.
  - 빈 `agg`에서 안전한 결과 반환(예외 없음).
  - (검증 가능하면) LLM에 넘긴 프롬프트가 `agg`의 수치를 이미 계산된 값으로 포함하고, 모델에게 숫자 계산을 요구하지 않음.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 모든 숫자가 코드(`agg`)에서 오고 LLM은 텍스트만 생성하는가(ADR-005)?
   - 플랜→모델 매핑(Pro=Opus / Free=Sonnet)이 함수 내부에 은닉되어 있는가(ADR-003/006)?
   - 반환 `Insight[]`가 mock과 동일한 타입/의미(kind·segments 평문·savingKrw 규칙)인가(ADR-008)?
   - `savingKrw`가 비음수 정수로 강제되는가?
   - `server-only`가 걸려 있고 모델 문자열이 밖으로 새지 않는가?
3. 결과에 따라 `phases/4-llm/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "live generateInsights 플랜분기·집계근거·스키마검증 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- LLM에 숫자 계산(합계·비율·순지출·절감액 산출)을 위임하지 마라. 이유: ADR-005 — 환각·불일치, 집계는 코드.
- 플랜 분기를 무시하고 두 플랜에 같은 모델을 쓰지 마라. 이유: ADR-003/006 — Pro=Opus, Free=Sonnet.
- LLM이 반환한 `savingKrw`를 검증 없이 통과시키지 마라(비음수 정수 강제). 이유: 금액은 부호없는 정수 KRW.
- `Insight.segments`에 마크다운/HTML을 그대로 실어 렌더하지 마라(평문 계약). 이유: 렌더 이스케이프·XSS 방어.
- 모델 문자열을 UI/queries/타입에 노출하지 마라. 이유: ADR-003 얇은 추상화.
- 테스트에서 실제 Claude API를 호출하지 마라(SDK 목킹만). 이유: 비용·비결정성.
- 테스트 없이 구현부터 쓰지 마라. 이유: TDD 강제.
- 기존 테스트를 깨뜨리지 마라.
