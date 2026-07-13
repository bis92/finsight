# Step 2: lib-csv

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (TDD 강제 · LLM 비용 통제 · amount/direction 규칙 · CSV 셀은 신뢰불가 입력)
- `/docs/ARCHITECTURE.md` (집계는 코드·판단은 AI / ColumnMapping 계약)
- `/docs/ADR.md` (ADR-004 컬럼 매핑은 AI·거래 분류는 규칙 / ADR-005)
- `/docs/PRD.md` (핵심기능 1: 인코딩 감지 → 파싱 → 매핑)
- Step 1 산출물: `src/types/`(특히 `transaction.ts`, `mapping.ts`) — 타입 계약을 그대로 사용하라.

이전 step에서 만들어진 타입을 꼼꼼히 읽고, 계약을 이해한 뒤 작업하라.

## 작업

**TDD 필수** — 이 step의 로직은 `lib/`의 순수 함수다. 반드시 테스트를 먼저 작성하고 통과하는 구현을 쓴다(tdd-guard 훅이 강제).

`src/lib/csv/`에 CSV 인코딩 감지·파싱·매핑 적용을 순수 함수로 구현한다. 외부 API 호출은 없다(전부 결정론적 로컬 처리).

1. **인코딩 감지** — `detectEncoding(bytes: Uint8Array | Buffer): 'utf-8' | 'euc-kr'`
   - 한국 카드사 CSV는 UTF-8 또는 EUC-KR. BOM/바이트 휴리스틱으로 판별. 애매하면 EUC-KR 폴백 여부는 구현 재량이되, 테스트로 두 인코딩 케이스를 모두 커버하라.
   - 디코딩 헬퍼: `decodeCsv(bytes, encoding): string` (EUC-KR 디코딩은 `iconv-lite` 등 라이브러리 허용 — 있으면 사용, 없으면 설치).

2. **파싱** — `parseCsv(text: string): { headers: string[]; rows: string[][] }`
   - 헤더 1행 + 데이터 행. 따옴표·콤마 이스케이프 처리(견고한 CSV 파서 라이브러리 사용 허용). 빈 행 무시.

3. **매핑 샘플 추출** — `buildMappingInput(headers, rows, locale='ko-KR'): ColumnMappingInput`
   - CRITICAL: `sampleRows`는 **최대 20개 데이터 행만** 담는다. 이유: CLAUDE.md — 전체 행을 LLM에 넣으면 비용·지연 폭증. 헤더는 sampleRows에 포함하지 않는다.

4. **매핑 적용(규칙 기반 변환)** — `applyMapping(headers, rows, mapping: ColumnMappingResult['mapping']): NewTransaction[]`
   - 확정된 컬럼 매핑으로 **전체 행**을 `NewTransaction[]`으로 변환(이 단계는 LLM 없이 코드로).
   - 금액 정규화: 통화기호·콤마·공백 제거 → **부호 없는 정수(원)**. 원문에 음수/괄호(예: `-1,000`, `(1,000)`) 또는 "환불/취소" 신호가 있으면 `direction='income'`으로 정규화하고 amount는 절대값. 그 외 지출은 `direction='expense'`.
     - CRITICAL: amount에 부호를 남기지 마라. 지출/수입은 `direction`으로만. 이유: CLAUDE.md 데이터 무결성.
   - 날짜 정규화: 다양한 입력형식(`YYYY.MM.DD`, `YYYY-MM-DD`, `YY/MM/DD` 등)을 `YYYY-MM-DD`로. 파싱 실패 행 처리 정책(스킵 또는 error 표시)을 정하고 테스트하라.
   - `category`는 이 단계에서 확정하지 않아도 된다(규칙 분류는 Step 3). 매핑에 category 컬럼이 있으면 원문을 보존해 Step 3이 enum 매핑하도록 `raw`에 담거나 임시 `'기타'`. **자유 문자열을 category 필드에 직접 넣지 마라**(enum만).
   - CRITICAL: CSV 셀은 **신뢰불가 입력**이다. merchant 등 문자열을 코드에서 실행/평가하지 말고 문자열로만 취급(프롬프트 인젝션·XSS 방어는 후속 렌더 step 책임이나, 여기서 HTML/스크립트로 해석하는 처리를 하지 마라).

## Acceptance Criteria

```bash
npm run build
npm test        # csv 파싱·인코딩·매핑 적용 테스트 통과
```

- 테스트는 최소: UTF-8/EUC-KR 각 1케이스, 금액 콤마/음수/괄호 정규화, 날짜 형식 2종 이상, sampleRows ≤20 상한을 검증한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `buildMappingInput`이 sampleRows ≤20을 강제하는가?
   - amount가 부호 없는 정수 + direction 정규화인가(환불→income)?
   - Step 1의 타입(`NewTransaction`, `ColumnMappingInput`)을 재사용했는가(중복 정의 금지)?
   - 외부 API 호출이 없는가(순수 함수)?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "생성 함수 시그니처·정규화 규칙 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 테스트 없이 구현부터 쓰지 마라. 이유: CLAUDE.md TDD 강제(tdd-guard 훅).
- CSV 전체 행을 LLM 입력용으로 만들지 마라(sampleRows는 ≤20). 이유: LLM 비용 통제.
- amount에 부호를 남기거나 category에 자유 문자열을 넣지 마라. 이유: 데이터 무결성 CRITICAL.
- 이 step에서 LLM(@anthropic-ai/sdk)을 호출하지 마라. 이유: 실제 매핑 호출은 services(Step 4) mock의 몫이다.
- 기존 테스트를 깨뜨리지 마라.
