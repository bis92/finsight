# Step 0: live-switch

## 읽어야 할 파일

먼저 아래 파일들을 읽고, 이 phase가 무엇을 컷오버하는지 정확히 파악하라:

- `/CLAUDE.md` (mock-first 시임 · 외부 API는 서버 전용 · service-role 규칙 · plan 진실 원천)
- `/docs/ARCHITECTURE.md` ('mock-first 시임'·'시임 인터페이스'·'환경변수'·'배포' 절 — `DATA_SOURCE=mock|live` 스위치)
- `/docs/ADR.md` (ADR-008 mock-first, ADR-003 플랜별 모델)
- 현재 스위치: `src/services/index.ts` (4개 팩토리, live 시 `throw new Error('live not implemented')`)
- 스위치가 읽는 env: `src/lib/env.ts` (`getDataSource()`)
- 시임 계약: `src/services/types.ts` (`TransactionsRepository`·`LlmService`)
- mock 구현(반환 타입 참조): `src/services/mock/{transactions,llm,profile,uploads}.ts`
- **phase 3~5 산출물(live 구현체 — 이 step이 배선할 대상):**
  - `src/services/live/transactions.ts` (`liveTransactionsRepository: TransactionsRepository`)
  - `src/services/live/llm.ts` (`liveLlmService: LlmService`)
  - `src/services/live/profile.ts` (live profile 서비스 함수 — mock `getMockProfile`과 동일 시그니처)
  - `src/services/live/uploads.ts` (live uploads 서비스 함수 — mock `listMockUploadsByUser`와 동일 시그니처)

이 step은 코드를 **최소로만** 수정한다: `src/services/index.ts`의 팩토리 배선 하나뿐이다. 도메인 로직·live 구현체는 phase 1~5에서 이미 만들어졌다는 전제다.

## 작업

**TDD 필수** — `src/services/index.ts`의 스위치 분기(mock 반환·live 반환·fail-closed)를 먼저 테스트로 고정한 뒤 배선한다. `getDataSource()`는 `process.env.DATA_SOURCE`를 읽으므로, 테스트에서 env를 세팅/복원하고 모듈을 재평가(`vi.resetModules()` + 동적 import)해 각 분기를 검증한다.

`src/services/index.ts`를 수정해 4개 팩토리가 `DATA_SOURCE`에 따라 mock/live 구현체를 반환하도록 완전 배선한다. **파일은 여전히 `server-only`이며 서버에서만 import된다.**

1. **`live not implemented` throw 전면 제거**
   - 현재 `assertMockDataSource()`가 live에서 무조건 throw한다. 이 헬퍼를 제거하고, 각 팩토리가 `getDataSource()` 값에 따라 분기하도록 바꾼다.

2. **4개 팩토리 live 배선** — mock/live 반환 타입은 **완전히 동일**해야 한다(ADR-008). 시그니처는 기존 그대로 유지:
   ```ts
   export function getTransactionsRepository(): TransactionsRepository
   export function getLlmService(): LlmService
   export function getProfileService(): typeof getMockProfile      // profile 단순 함수
   export function getUploadsService(): typeof listMockUploadsByUser // uploads 단순 함수
   ```
   - `getDataSource() === 'live'` → `src/services/live/*`의 구현체(`liveTransactionsRepository`·`liveLlmService`·live profile 함수·live uploads 함수) 반환.
   - `getDataSource() === 'mock'` → 기존 mock 구현체(변경 없음).
   - CRITICAL: live import는 반드시 **서버 전용 모듈**만 참조한다(각 live 구현체가 이미 `server-only`·시크릿 env를 사용). 이 파일에 시크릿을 직접 읽는 로직을 넣지 마라 — 배선만 한다.

3. **fail-closed** — `getDataSource()`가 이미 `mock|live` 외 값을 throw하므로, 팩토리 레벨에서는 두 분기를 모두 처리하면 된다. 그럼에도 방어적으로, 알 수 없는 분기에 도달하면 명확한 에러를 던진다(silent mock fallback 금지). live 구현체가 요구하는 시크릿(예: `SUPABASE_SERVICE_ROLE_KEY`·`ANTHROPIC_API_KEY`)의 부재 검증은 각 live 구현체·`src/lib/env.ts` 책임이며, 여기서 중복 검증하지 않는다. 다만 시크릿이 없을 때 mock으로 조용히 넘어가는 경로를 절대 만들지 마라.
   - CRITICAL: 클라이언트가 보낸 값(요청 body 등)으로 `DATA_SOURCE`를 결정하지 마라. 오직 서버 env(`getDataSource()`)만 신뢰한다. 이유: CLAUDE.md — plan/스위치 진실 원천은 서버.

4. **mock 경로 불변 보장** — `DATA_SOURCE=mock`(기본값)에서 기존 동작·기존 테스트가 100% 그대로여야 한다. 이 phase의 유일한 회귀 리스크가 여기다.

**전제 확인**: `src/services/live/*` 파일 중 이 step이 참조하는 export가 없으면(phase 1~5 미완), 존재하는 export명에 맞춰 배선하되 시그니처가 시임과 다르면 **live 구현을 새로 만들지 말고** blocked 처리한다(작업 범위 밖). status=blocked + blocked_reason에 "누락/불일치한 live 구현체 경로·export명"을 명시하고 중단하라.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소: `DATA_SOURCE=mock`에서 4개 팩토리가 각각 mock 구현체를 반환. `DATA_SOURCE=live`에서 4개 팩토리가 각각 live 구현체를 반환(throw하지 않음). `DATA_SOURCE=invalid`에서 `getDataSource()`가 throw.
- 기존 mock 관련 테스트(`src/services/mock/index.test.ts` 등)가 전부 통과.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `src/services/index.ts`에서 `live not implemented` throw가 완전히 사라졌는가?
   - `DATA_SOURCE=live` 4개 팩토리가 모두 live 구현체를 반환하는가(하나라도 throw/미배선이 남지 않았는가)?
   - `DATA_SOURCE=mock`에서 반환 타입·동작이 이전과 동일한가(회귀 없음)?
   - 파일이 여전히 `server-only`인가? 시크릿을 이 파일에서 직접 읽지 않는가?
   - 시크릿 부재 시 mock으로 조용히 fallback하는 경로가 없는가(fail-closed)?
3. 결과에 따라 `phases/6-launch/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "4개 팩토리 live 배선·throw 제거·mock 불변 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - live 구현체 누락/시그니처 불일치 → `"status": "blocked"`, `"blocked_reason": "누락 경로·export명"` 후 중단

## 금지사항

- mock 경로(`DATA_SOURCE=mock`)의 동작을 바꾸지 마라. 이유: 이 phase는 컷오버일 뿐, mock 배포가 계속 유효해야 한다(ADR-008).
- live 구현체(Supabase repo·Claude 서비스 등)를 이 step에서 새로 작성하지 마라. 이유: phase 1~5의 scope. 누락이면 blocked.
- 시크릿이 없을 때 mock으로 조용히 넘어가지 마라. 이유: fail-closed — 실운영에서 mock 데이터가 새면 안 된다.
- `DATA_SOURCE`를 `NEXT_PUBLIC_`로 노출하거나 클라이언트 입력으로 스위치를 결정하지 마라. 이유: CLAUDE.md CRITICAL 서버 전용 스위치.
- 시임 인터페이스(`TransactionsRepository`·`LlmService`)의 시그니처를 바꾸지 마라. 이유: UI·queries 불변 계약.
- 기존 테스트를 깨뜨리지 마라.
