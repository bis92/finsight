# Step 3: subscriptions-live

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (구독은 "확정" 아닌 후보 · 집계/판정은 코드 · Pro 앵커=정기구독 후보 탐지 · 금액은 부호없는 정수 KRW)
- `/docs/ADR.md` (**ADR-003** Pro 심화=`claude-opus-4-8`·Opus 제약 · **ADR-005** 판단은 AI·근거는 코드 · **ADR-006** Pro 앵커=구독 후보 탐지)
- `/docs/PRD.md` (정기구독 **후보** 탐지 · **"확정 표현 금지"** · 단일 월이면 후보로만)
- `/src/lib/analysis/index.ts` (규칙 기반 `detectSubscriptions(txns): SubscriptionCandidate[]` — merchant+amount+cadence 반복 탐지, 이미 존재하는 코드 우선 경로)
- `/src/types/transaction.ts` (`Transaction`·`Direction`·금액=비음수 정수)
- `/src/types/analysis.ts` (`SubscriptionCandidate`·`Cadence` `'monthly'|'weekly'|'unknown'`·`confidence`·`lastSeenOn`)
- `/src/services/types.ts` (`LlmService.detectSubscriptions(txns)` 시그니처)
- `/src/services/mock/llm.ts` (mock `detectSubscriptions` — `lib/analysis`의 규칙 함수를 재사용 · live가 지켜야 할 반환 타입/의미 계약)
- Step 0 산출물: `src/lib/llm/client.ts` (`OPUS`·구조화 헬퍼)
- Step 1·2 산출물: `src/services/live/llm.ts` (같은 파일에 이어서 구현)

이전 코드를 꼼꼼히 읽고 시임 계약을 이해한 뒤 작업하라.

## 작업

**TDD 필수** — Anthropic SDK를 목킹해 단위테스트를 먼저 작성하고 통과 구현을 쓴다(실 API 호출 금지).

`src/services/live/llm.ts`에 live `detectSubscriptions`를 추가한다.

1. **`detectSubscriptions(txns: Transaction[]): Promise<SubscriptionCandidate[]>`**
   - **규칙 우선(코드), LLM 보조**: 먼저 `lib/analysis`의 규칙 기반 `detectSubscriptions`(merchant + amount 유사 + 반복 주기 cadence)로 후보를 뽑는다 — 반복성·주기·금액 매칭 같은 **판정 근거는 코드로 결정론적으로** 계산한다(ADR-005). LLM은 여기에 얹어 **가맹점명 정규화/구독 서비스 여부 판단** 같은 애매한 판단만 보조한다.
   - **Pro 전용**: 이 심화 탐지는 Pro 앵커 기능이므로 모델은 **`OPUS`**(`claude-opus-4-8`)를 쓴다(ADR-003/006). 모델 선택은 함수 내부에 은닉. (권한 게이팅 자체는 상위 라우트/`profiles.plan`의 책임 — 이 함수는 계약대로 후보를 반환한다.)
   - **LLM 사용 시 입력 절제(비용)**: 전체 거래를 통째로 넣지 말고, **규칙 후보(및 그 근거 거래 요약)만** LLM에 전달한다. 수백~수천 행을 통째로 LLM에 넣지 마라(ADR-004 정신).
   - **구조화 JSON 출력**(step0 헬퍼)으로 `SubscriptionCandidate[]` 형태를 강제: `merchant`, `amount`(비음수 정수 KRW), `cadence` `'monthly'|'weekly'|'unknown'`, `confidence`(0~1), `lastSeenOn`(YYYY-MM-DD).
   - **단일 월만 있으면 "후보"로만**: 여러 달 데이터가 있어야 monthly/weekly를 판정할 수 있다. 단일 월(또는 주기 판정 불가)이면 `cadence: 'unknown'` + **낮은 confidence**로 후보 표시한다. CRITICAL: **확정 표현 금지**(PRD) — 반환은 어디까지나 "후보"이며 확정된 구독으로 단정하는 문구/필드를 만들지 마라. 불확실성은 `confidence`로 표현한다.
   - **정합성 보정(코드로, 반환 전)**:
     - `amount`는 비음수 정수로 강제, `confidence`는 0~1 클램프, `cadence`는 enum 밖이면 `'unknown'`으로.
     - `lastSeenOn`은 실제 `txns`에서 파생된 유효 날짜(YYYY-MM-DD)로 검증 — LLM이 지어낸 날짜를 그대로 신뢰하지 말고 코드가 가진 거래 날짜로 채운다.
     - LLM이 근거 없는 가맹점을 추가하면 규칙 후보에 없는 항목은 버린다(환각 방어).
   - **빈/무거래 안전성**: 거래가 없거나 후보가 없으면 빈 배열 반환(LLM 호출 없이).
   - **에러 처리**: 파싱/SDK 에러는 step0 헬퍼가 일반화해 던지므로 전파. LLM 보조가 실패해도 최소한 규칙 기반 후보를 반환할 수 있으면 그렇게 하는 것을 권장(핵심 가치 보존). 내부 예외 원문은 사용자에게 노출하지 않는다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(SDK 목킹, 실 네트워크 없음):
  - 다월(monthly/weekly) 거래에서 규칙 후보가 잡히고, 단일 월 데이터에서는 `cadence:'unknown'` + 낮은 confidence 후보로 반환.
  - 반환에 "확정" 단정 표현/필드가 없고 불확실성이 `confidence`로 표현됨.
  - 호출 모델이 `OPUS`(`claude-opus-4-8`).
  - LLM이 규칙 후보에 없는 가맹점을 추가하거나 지어낸 날짜/음수 금액을 반환해도 코드 보정으로 제거/정규화됨.
  - 빈 입력에서 빈 배열(예외·불필요한 LLM 호출 없음).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 규칙(코드)이 판정 근거를 결정론적으로 계산하고 LLM은 보조만 하는가(ADR-005)?
   - 단일 월에서 확정이 아닌 후보(`unknown`/낮은 confidence)로만 표시하고 "확정 표현"이 없는가(PRD)?
   - 전체 거래가 아니라 후보/근거 요약만 LLM에 넘겨 비용을 절제하는가(ADR-004)?
   - 반환 타입/의미가 mock 및 `lib/analysis`와 정합적인가(ADR-008)?
   - `amount`(비음수 정수)·`confidence`(0~1)·`cadence`(enum)·`lastSeenOn`이 코드로 검증되는가?
   - 모델이 `OPUS`이고 모델 문자열이 밖으로 새지 않는가?
3. 결과에 따라 `phases/4-llm/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "live detectSubscriptions 규칙우선·Opus보조·후보표현 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- 구독을 "확정"으로 표현하지 마라(후보만, `confidence`로 불확실성 표현). 이유: PRD — 단일 월/불충분 데이터에서 오탐.
- 반복성·주기 판정을 LLM에 맡기지 마라(코드로 결정론적 계산). 이유: ADR-005 — 판정 근거는 코드.
- 전체 거래(수백~수천 행)를 통째로 LLM에 넣지 마라(후보/근거 요약만). 이유: ADR-004 — 비용·지연.
- LLM이 지어낸 가맹점/날짜/음수 금액을 검증 없이 통과시키지 마라. 이유: 환각 방어·금액 정수 규칙.
- 컬럼매핑/Free 분석용 Sonnet을 쓰지 마라(Pro 심화=Opus). 이유: ADR-003/006.
- 모델 문자열을 UI/queries/타입에 노출하지 마라. 이유: ADR-003 얇은 추상화.
- 테스트에서 실제 Claude API를 호출하지 마라(SDK 목킹만). 이유: 비용·비결정성.
- 테스트 없이 구현부터 쓰지 마라. 이유: TDD 강제.
- 기존 테스트를 깨뜨리지 마라.
