# Step 4: csv-parse-core

## 읽어야 할 파일
- `/docs/ARCHITECTURE.md` (인코딩 파이프라인, 금액/날짜/방향 정규화, 데이터 모델)
- `/CLAUDE.md` (금액=정수 원+direction, 환불=income, 해외=원화 청구액만, 단일 파일)
- 이전 step 산출물: `src/types/`(Transaction, NewTransaction, Direction, Category, ColumnMapping)

## 작업
CSV를 표준 스키마로 바꾸는 **순수 함수 라이브러리**(`src/lib/csv/`)를 TDD로 만든다. 키·네트워크 불필요. **단일 파일만** 다룬다(병합·중복감지 금지 — 로드맵).

시그니처(구현은 재량):
- `detectEncoding(bytes: Uint8Array): 'utf-8' | 'euc-kr'` — 휴리스틱.
- `decodeCsv(bytes: Uint8Array, encoding?: string): string` — `TextDecoder`로 디코딩(EUC-KR 지원). Papaparse에 넘기기 전 필수.
- `stripPreamble(text: string): string` — 상단 계좌요약/빈 줄 제거.
- `parseRows(text: string): string[][]` — papaparse 등으로 파싱(BOM·따옴표·셀내 개행 처리).
- `normalizeAmount(raw: string): number` — `"1,234원"`, `"-1,234"`, `"(1,234)"`(괄호=음수) → **부호 없는 정수(원)**. 별도로 방향 판정.
- `normalizeDate(raw: string): string` — `2024.01.02` / `24/01/02` / `20240102` → ISO(`YYYY-MM-DD`).
- `normalizeDirection(raw, amountSign): Direction` — 지출/수입 판정. **환불·매입취소는 'income'**.
- `buildTransactions(rows: string[][], mapping: ColumnMapping): NewTransaction[]` — 매핑 적용, 해외거래는 원화 청구액만 사용.

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test   # 아래 엣지케이스가 테스트로 존재하고 통과해야 함
```
필수 테스트 케이스(먼저 작성): 빈 CSV, 거래 0건, ragged row(열 수 불일치), BOM 포함, 셀 내 개행/따옴표, 금액 0, 괄호 음수, 천단위 콤마+"원", 환불→income, `2024.01.02`/`24/01/02`/`20240102` 날짜, EUC-KR 바이트 디코딩, 미래/과거 날짜.

## 검증 절차
1. AC 커맨드 실행. 위 엣지케이스가 테스트로 커버되는지 확인.
2. 아키텍처 체크리스트:
   - 함수가 순수(부작용 없음)하고 `lib/csv/`에 있는가?
   - 금액이 정수 원 + direction 분리인가? 환불이 income인가?
   - 다중파일 병합/중복감지 로직이 **없는가**(로드맵)?
3. `phases/0-mvp-ui/index.json`의 step 4 업데이트(completed+summary / error).

## 금지사항
- 다중 파일 병합·중복(fingerprint/upsert) 로직을 만들지 마라. 이유: MVP는 단일 파일. 로드맵으로 미룸.
- LLM을 호출하지 마라. 이유: 이 step은 결정적 파싱/정규화만. 컬럼 매핑은 step 5에서 `LlmService`로.
- Papaparse에 디코딩 안 된 바이트를 넘기지 마라. 이유: EUC-KR이 깨진다. 반드시 `decodeCsv` 먼저.
