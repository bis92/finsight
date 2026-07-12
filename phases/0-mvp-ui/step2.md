# Step 2: domain-types-mocks

## 읽어야 할 파일
- `/docs/ARCHITECTURE.md` (데이터 모델, 시임 인터페이스 계약, 레이어링, 에러 봉투)
- `/CLAUDE.md` (mock은 /api 뒤 repository에만, 금액=정수+direction, category enum, 환불 규칙)
- 이전 step 산출물: `src/lib/`, `src/services/`, `src/types/` 골격

## 작업
도메인 타입 + 시임 인터페이스 + **mock repository**를 만든다. 이게 mock-first의 심장이다.

1. **타입** (`src/types/`): `Direction`('expense'|'income'), `Category`(고정 enum ~12: 식비·교통·쇼핑·구독·주거통신·의료·금융·여가·교육·수입·기타 등), `Transaction`, `NewTransaction`, `Upload`, `UploadStatus`, `Profile`, `Plan`('free'|'pro'), `Analysis`, `Insight`, `Subscription`, `ColumnMapping`, `AggregateSnapshot`, `DateRange`. `ARCHITECTURE.md` 데이터 모델과 필드 일치.
2. **시임 인터페이스** (`src/types/`): `TransactionsRepository`, `LlmService`를 `ARCHITECTURE.md` 계약 그대로 정의. (uploads/profiles는 인터페이스 없이 함수로)
3. **공용 클라이언트** (`src/lib/`): `apiClient`(fetch 래퍼, 에러 시 `ApiError`(status+서버 message)로 정규화), `ApiError` 클래스.
4. **mock fixtures** (`src/services/mock/`): 현실적인 국내 카드 거래 데이터(다양한 category, **환불(direction=income) 포함**, 여러 날짜/가맹점), free·pro `Profile` 각각, `Analysis`/`Insight` 샘플, `Subscription`(정기구독) 샘플.
5. **mock repository** (`src/services/mock/`): `TransactionsRepository`·`LlmService` 구현(결정적 값 반환) + uploads/profiles 함수. `LlmService.mapColumns`는 샘플행 헤더를 그럴듯하게 매핑, `detectSubscriptions`는 fixtures의 반복결제를 반환.
6. **repository 팩토리** (`src/services/index.ts`): `DATA_SOURCE` env로 mock|live 선택. phase 0에선 live 요청 시 `"not implemented (phase 1)"` 에러를 던지는 스텁.
7. **테스트**: mock repository 동작(예: `insertMany` 후 `listByUser`가 반영, `reclassify`가 category 변경)과 `apiClient`의 `ApiError` 정규화를 테스트. 이유: tdd-guard가 `services/`·`lib/`의 `.ts` 로직에 테스트 선행을 요구.

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test
```

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - mock 데이터가 `services/`에만 있고 `queries`·컴포넌트엔 없는가?
   - `Transaction.amount`가 정수이고 `direction`이 분리됐는가? 환불 샘플이 `direction='income'`인가?
   - `category`가 자유 문자열이 아니라 enum인가?
   - mock과 real이 교체 가능하도록 인터페이스 반환 타입이 명확한가?
3. `phases/0-mvp-ui/index.json`의 step 2 업데이트(completed+summary / error).

## 금지사항
- mock 데이터를 `queries`나 React 컴포넌트에 직접 넣지 마라. 이유: phase 1 실연동 시 UI 재작성을 유발한다.
- 실제 Supabase/Anthropic 클라이언트를 만들지 마라. 이유: phase 1 대상. 여기선 스텁만.
- `amount`에 부호로 지출/수입을 표현하지 마라. 이유: `direction` 컬럼으로만. 집계 무결성.
