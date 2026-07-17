# Step 0: llm-client

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (플랜별 모델 규칙: 컬럼매핑·Free 분석=`claude-sonnet-4-6`, Pro 지출진단=`claude-opus-4-8` · 시크릿 server-only · 외부 API는 서버에서만)
- `/docs/ADR.md` (**ADR-003** Claude API 얇은 추상화 · 어댑티브 씽킹 · 플랜별 모델 · Opus 제약 · ADR-004/005 집계는 코드·판단은 AI)
- `/docs/ARCHITECTURE.md` (시임 인터페이스 `LlmService` · 데이터 흐름)
- `/src/lib/env.ts` (`ANTHROPIC_API_KEY`는 server-only로 접근 — 이 파일 상단에 `import 'server-only'` 존재)
- `/src/services/types.ts` (`LlmService` 인터페이스: `mapColumns`·`generateInsights`·`detectSubscriptions`)
- `/src/services/mock/llm.ts` (mock 구현 — live가 반환 타입을 **완전히 동일**하게 맞춰야 할 계약)
- `package.json` (현재 의존성 — `@anthropic-ai/sdk` 설치 여부 확인)

이전 코드를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라.

## 배경 (phase 1~6 전체 맥락)

이 phase(`4-llm`)는 mock-first(ADR-008)로 완성된 `0-mvp`를 실연동으로 교체하는 작업 중 **LLM(Claude API) 실연동**을 담당한다. `1-supabase` 완료를 전제로 하며, `3-data-live`와 병렬 설계 가능하나 순차 실행된다. **`DATA_SOURCE=live` 컷오버는 마지막 `6-launch`에서 한 번만** 한다 — 이 phase는 mock 동작을 유지한 채 `src/services/live/llm.ts`(live 구현)와 그 토대만 추가한다.

이 step은 그 토대인 **Claude 클라이언트 + 모델 상수 + 공통 헬퍼**를 만드는 부트스트랩이다. 실제 `LlmService.mapColumns`/`generateInsights`/`detectSubscriptions` live 구현은 step1~3에서 이 모듈을 소비한다.

## 작업

**TDD 필수** — `lib/`의 로직은 테스트 파일이 선행해야 한다(tdd-guard 훅 강제). Anthropic SDK는 **목킹**해 단위테스트한다(실 API 호출 금지). 테스트를 먼저 작성하고 통과 구현을 쓴다.

1. **의존성** — `package.json`
   - `@anthropic-ai/sdk`가 dependencies에 없으면 추가·설치한다. 이미 있으면 버전 변경 없이 재사용한다.
   - 다른 의존성·scripts는 변경하지 마라.

2. **`src/lib/llm/client.ts`** — Claude 클라이언트 + 모델 상수 + 공통 헬퍼
   - 파일 상단에 `import 'server-only'`를 둔다. 이유: 이 모듈은 `ANTHROPIC_API_KEY`를 읽고 Claude를 호출하므로 서버 전용이다(클라이언트 번들 유입 금지).
   - **모델 상수(이 모듈에 은닉)**:
     ```ts
     export const SONNET = 'claude-sonnet-4-6' as const  // 컬럼 매핑 · Free 분석
     export const OPUS = 'claude-opus-4-8' as const       // Pro 지출 진단 · 구독 보조
     ```
     모델 선택 로직(plan→model 매핑)은 이 모듈/서비스 레이어 안에만 둔다. UI·queries·타입에 모델 문자열을 노출하지 마라(ADR-003 얇은 추상화).
   - **`ANTHROPIC_API_KEY` 접근** — `src/lib/env.ts`에 접근자(예: `getAnthropicApiKey(): string`)를 추가하거나 기존 패턴을 따른다. 미설정 시 **어떤 변수가 없는지 명시하는 명확한 런타임 에러**를 throw한다(예: `throw new Error('ANTHROPIC_API_KEY is not set')`). CRITICAL: `NEXT_PUBLIC_` 접두사 금지(시크릿 노출).
   - **클라이언트 팩토리** — `getAnthropicClient(): Anthropic`. 지연 생성(모듈 로드 시점이 아니라 호출 시점에 key를 읽어 클라이언트 생성)해, 테스트에서 목킹·env 주입이 쉽도록 한다. `new Anthropic({ apiKey })`.
   - **공통 헬퍼** — 구조화 JSON 출력을 얻는 단일 진입점(예: `async function completeJson<T>({ model, system, user, schema }): Promise<T>`):
     - `client.messages.create({ model, max_tokens, thinking: { type: 'adaptive' }, output_config: { format: { type: 'json_schema', schema } }, system, messages })` 형태.
     - **어댑티브 씽킹** `thinking: { type: 'adaptive' }`을 두 모델 모두에 사용(ADR-003).
     - **구조화 출력**은 `output_config.format`(json_schema)으로 강제. 구(deprecated) `output_format` top-level 파라미터를 쓰지 마라.
     - 응답 `content`에서 텍스트 블록을 뽑아 `JSON.parse`한다(툴/모델 출력은 직접 raw 문자열 매칭 금지, 반드시 파싱).
     - `stop_reason === 'refusal'` 및 `stop_reason === 'max_tokens'`(잘린 출력)를 감지해 명확한 에러로 던진다. 내부 예외·SDK 원문을 사용자 메시지로 노출하지 않도록, 이 헬퍼는 일반화 가능한 에러를 던지고 상세는 상위(라우트)에서 로그 처리한다(CLAUDE.md: 내부 예외 미노출).

3. **ADR-003 준수 규칙(코드/주석으로 강제)** — 이 규칙들을 어기면 400 에러가 난다:
   - **두 모델 모두 어댑티브 씽킹**을 사용하며, 어댑티브 씽킹 사용 시 **마지막(final) assistant 프리필을 messages에 넣지 마라**(400).
   - **Opus(및 Sonnet 4.6)에서 `thinking.budget_tokens`를 쓰지 마라**(제거됨/deprecated → 400). 깊이 조절이 필요하면 `output_config.effort`(`low`|`medium`|`high`)를 쓴다.
   - **`temperature`/`top_p`/`top_k`를 넣지 마라**(Opus 4.8에서 제거 → 400).
   - 위 3가지를 파일 상단 주석 또는 헬퍼 인근 주석에 "왜 금지인지"와 함께 명시해, step1~3 구현자가 재발 방지하도록 한다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(Anthropic SDK 목킹, 실 네트워크 없음):
  - `getAnthropicClient`/env 접근자가 `ANTHROPIC_API_KEY` 설정 시 값을 사용하고, 미설정 시 명확한 에러를 throw.
  - 공통 헬퍼가 목킹된 `messages.create` 호출 시 `thinking: {type:'adaptive'}`와 `output_config.format`을 전달하고 `budget_tokens`/`temperature`를 전달하지 **않는다**.
  - 헬퍼가 구조화 JSON 응답을 파싱해 반환하고, `stop_reason==='refusal'`/`'max_tokens'`에서 에러를 던진다.
  - `SONNET`/`OPUS` 상수가 정확히 `'claude-sonnet-4-6'`/`'claude-opus-4-8'`.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `client.ts` 상단에 `import 'server-only'`가 있고 `ANTHROPIC_API_KEY`를 서버 전용으로만 읽는가(`NEXT_PUBLIC_` 미부착)?
   - 모델 상수가 이 모듈에 은닉되어 UI/queries/타입에 모델 문자열이 노출되지 않는가(ADR-003)?
   - 헬퍼가 어댑티브 씽킹 + `output_config.format`을 쓰고, `budget_tokens`/`temperature`/`top_p`/`top_k`/마지막 assistant 프리필을 쓰지 않는가?
   - 테스트가 실 Claude 호출 없이 SDK 목킹으로 검증되는가?
3. 결과에 따라 `phases/4-llm/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "client.ts 팩토리·모델 상수·구조화 헬퍼 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- `ANTHROPIC_API_KEY`(또는 어떤 시크릿)에 `NEXT_PUBLIC_` 접두사를 붙이지 마라. 이유: CLAUDE.md CRITICAL — 시크릿이 클라이언트 번들에 노출된다.
- 클라이언트 컴포넌트에서 import 가능한 위치에 이 모듈을 두거나, `server-only`를 빼지 마라. 이유: 외부 API 호출은 서버 전용.
- `thinking.budget_tokens`·`temperature`·`top_p`·`top_k`·마지막 assistant 프리필을 쓰지 마라. 이유: ADR-003 — Opus 4.8/Sonnet 4.6에서 400 에러가 난다.
- 모델 문자열을 UI/queries/컴포넌트/타입에 노출하지 마라. 이유: ADR-003 얇은 추상화 — 모델 선택은 서비스 레이어에 가둔다.
- 테스트에서 실제 Claude API를 호출하지 마라(SDK 목킹만). 이유: 비용·비결정성·CI 안정성.
- `DATA_SOURCE=live` 컷오버나 `services/index.ts` 분기를 이 step에서 만들지 마라. 이유: live 배선은 step1~4, 컷오버는 6-launch.
- 테스트 없이 구현부터 쓰지 마라. 이유: TDD 강제(tdd-guard).
- 기존 테스트를 깨뜨리지 마라.
