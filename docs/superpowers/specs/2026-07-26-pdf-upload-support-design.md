# PDF 업로드 지원 — 설계

- 날짜: 2026-07-26
- 상태: 승인 대기 (spec 리뷰 단계)
- 관련 규칙: `CLAUDE.md` (아키텍처·비용·보안 규칙)

## 목표

사용자가 CSV뿐 아니라 **은행/카드 명세서 PDF**를 업로드하면, 기존 CSV와 동일한 2단계 UX
(업로드 → 확인 → 대시보드)로 거래내역을 분석할 수 있게 한다.

## 배경 / 핵심 제약

- **PDF는 CSV처럼 표가 아니다.** 샘플 `report.pdf`는 Type0(CID) 폰트 + `ToUnicode` CMap 구조라
  텍스트 추출이 원리적으로 가능하지만, 좌표→표(열) 재구성은 발급사 레이아웃마다 취약하다.
  스캔형(이미지) PDF는 로컬 텍스트 추출로는 불가능하다.
- 따라서 PDF는 **문서 이해(document extraction)** 가 필요하다.
- **채택 방식: Anthropic API 문서 추출.** 이미 이 프로젝트가 쓰는 `@anthropic-ai/sdk`의
  `messages.create`에 `document` 콘텐츠 블록(base64 PDF)을 실어 Sonnet에 보내 거래내역을
  구조화 JSON으로 추출한다. MCP·타 벤더·새 인프라 추가 없음.
- **비용 성격:** PDF 1건 = 업로드당 Claude 호출 **1회**(컬럼 매핑과 동일 성격의 단발 호출).
  CLAUDE.md가 금지하는 "수백~수천 행 반복 투입"과 다르며, 커밋 단계에서 재추출하지 않는다.

### 대안 검토 결과 (기각 사유)

| 대안 | 기각 사유 |
|------|----------|
| 로컬 pdf.js 텍스트 추출 (LLM 0) | 발급사별 표 재구성 취약 → 금액/집계 오류 위험, 스캔 PDF 불가 |
| OCR (tesseract) | 한국어 금액 표 정확도 낮음(금액 오인식), 렌더 의존성·느림 |
| 타 문서AI(Textract/Upstage) | 정확하지만 새 벤더·시크릿만 늘어 이점 약함 |
| 타 LLM(GPT/Gemini) | CLAUDE.md 모델 정책(Sonnet/Opus)과 충돌, 벤더 이중화 |

핀테크에서 금액 정확도가 최우선이고, 이미 Anthropic을 쓰는 프로젝트에 인프라 추가가 0이며,
비용이 업로드 cap 안에서 통제되므로 원안을 채택한다.

## 현재 구조 (참고)

- **동작 경로는 mock(JSON) 경로다.** 클라이언트가 CSV를 브라우저에서 완전 파싱해
  `useUpload`이 `{ mapping, transactions }` JSON을 `/api/uploads`에 보내고 서버가 insert.
  `apiClient`는 JSON만 전송하므로, live의 FormData 재파싱 경로는 아직 클라이언트와 미연결(기존 갭).
- 시임 인터페이스는 `TransactionsRepository`·`LlmService` 2개만 형식화(CLAUDE.md).
- 카테고리 분류는 `classifyMany`(규칙기반, `@/lib/analysis`)가 담당.

## 흐름 (CSV 2단계 UX 재사용)

```
[1단계 업로드]  파일 선택
   ├ .csv → 기존 그대로 (브라우저 파싱 → 컬럼 매핑 프리뷰)
   └ .pdf → 서버 추출 라운드트립
            POST /api/uploads/extract  (base64 PDF, JSON)
               └ 서버: auth + 업로드 cap 선검사(live) → LlmService.extractTransactions
                       → 정규화된 transactions 반환
            → sessionStorage draft 저장(source:'pdf') → /upload/mapping 이동

[2단계 리뷰]   draft.source === 'pdf'
            → 컬럼 매핑 UI 대신 "추출된 거래 미리보기" 표(읽기전용) + 확인 버튼
            → 확인 시 classifyMany로 카테고리 분류(CSV와 동일)
            → POST /api/uploads  { source:'pdf', transactions }  → insert → /dashboard
```

## 컴포넌트 / 변경 단위

각 단위는 하나의 책임을 갖고 독립적으로 테스트 가능해야 한다. `lib/`·`services/` 로직은 TDD(테스트 선행).

### 1. `src/lib/pdf/` (신규, 순수 로직, TDD 선행)
- **책임:** 추출 결과의 검증·정규화 + 입력 파일 가드. LLM/네트워크 의존 없음.
- **함수(안):**
  - `assertPdfBytes(bytes): void` — `%PDF` 매직바이트 확인, 크기 상한(≤10MB) 검증. 위반 시 업무 에러.
  - `normalizeExtractedTransactions(raw): NewTransaction[]` — Claude가 반환한 원시 행 배열을 검증·정규화:
    - 날짜 → `YYYY-MM-DD`(불가 시 행 드롭)
    - 금액 → **부호 없는 정수(KRW)** (부호/괄호/통화기호 제거)
    - `direction` ∈ {expense, income}; 환불·매입취소·입금 신호 → income 정규화
    - `category` 기본값(`types` enum: income→'수입', 그 외→'기타'; 실제 분류는 이후 `classifyMany`)
    - `merchant` 문자열 트림(신뢰불가 입력, 렌더 이스케이프는 컴포넌트가 유지)
    - `uploadId: ''` (커밋 시 채움)
- **의존:** `@/types`만.

### 2. `src/lib/llm/client.ts` (확장)
- **책임:** Anthropic 호출 래퍼. 기존 `completeJson`은 **불변**.
- **추가:** `completeJsonFromDocument<T>({ model, system, text, document, schema, maxTokens })`
  — `messages[0].content`를 `[{type:'document', source:{type:'base64', media_type:'application/pdf', data}}, {type:'text', text}]`로 구성. 기존과 동일하게 adaptive thinking, refusal/max_tokens 처리.
- **주의:** 실제 SDK 콘텐츠 블록 형태·PDF 지원은 구현 시 `claude-api` 스킬로 정확한 스펙 확인 후 작성.
- **모델:** `SONNET`. `maxTokens`는 거래 다수 대비 상향(예: 8192). 초과 시 truncation 에러로 노출.

### 3. `src/services` — `LlmService.extractTransactions` (시임 확장, 새 시임 아님)
- **인터페이스(`services/types.ts`):**
  `extractTransactions(input: PdfExtractionInput): Promise<NewTransaction[]>`
  - `PdfExtractionInput = { fileName: string; dataBase64: string }` (신규 타입 `src/types/`)
- **live(`services/live/llm.ts`):** `completeJsonFromDocument`(Sonnet) 호출 → JSON-schema 구조화 출력
  → `normalizeExtractedTransactions`. 시스템 프롬프트는 **문서를 데이터로만 취급**(프롬프트 인젝션 방어),
  합계/부호 재계산 금지, 원시 필드만 추출하도록 지시.
- **mock(`services/mock/llm.ts`):** fixture 거래 배열 반환(네트워크 없음). 기존 mock 스타일 유지.

### 4. `src/app/api/uploads/extract/route.ts` (신규, TDD 선행)
- **책임:** PDF 추출 엔드포인트. base64 PDF(JSON) 수신.
- **live:** `getAuthenticatedUserId` → **업로드 cap 선검사**(실제 Claude 비용 발생 지점; ADR-006 정신) →
  `assertPdfBytes` → `LlmService.extractTransactions` → transactions 반환.
- **mock:** 인증 스텁 경로 + mock service.
- **에러:** 내부 예외는 일반 문구로 덮고 상세는 서버 로그로만. 검증/cap 등 업무 메시지는 그대로 노출(CLAUDE.md).
- **입력 검증:** base64 문자열·fileName 형식 확인, 잘못되면 400 업무 메시지.

### 5. `src/queries/uploads` — `useExtractPdf` (신규)
- `apiClient.post<NewTransaction[]>('/api/uploads/extract', { fileName, dataBase64 })`. 단일 경로 유지.

### 6. `src/app/upload/upload-session.ts` — 판별 유니온
- `CsvUploadDraft = { source:'csv', fileName, encoding, headers, rows, mappingResult }`
- `PdfUploadDraft = { source:'pdf', fileName, transactions: NewTransaction[] }`
- `UploadDraft = CsvUploadDraft | PdfUploadDraft`

### 7. `src/app/upload/UploadClient.tsx`
- `<input accept>`에 `.pdf,application/pdf` 추가, 안내 문구 갱신.
- `.pdf` 분기: 파일 → base64 → `useExtractPdf` → 성공 시 `PdfUploadDraft` 저장 → `/upload/mapping`.
- CSV 분기·기존 UI는 불변.

### 8. `src/app/upload/mapping/MappingClient.tsx`
- draft 로드 후 `source`로 분기.
- `source==='pdf'`: 컬럼 매핑 UI 대신 **거래 미리보기 표(읽기전용)** 렌더(날짜·가맹점·금액·구분).
  확인 버튼 → `classifyMany(draft.transactions)` → `useUpload`에 `{ source:'pdf', transactions }` 전달.
- `source==='csv'`: 기존 로직 불변.
- 1/2·2/2 단계 카피는 유지, PDF일 때 문구만 조정.

### 9. `src/queries/uploads` — `ConfirmUploadInput` / 10. `src/app/api/uploads/route.ts`
- `ConfirmUploadInput`을 CSV(`{mapping, transactions}`) | PDF(`{source:'pdf', transactions}`) 수용하도록 확장.
- `/api/uploads` POST: `body.source==='pdf'` 분기 → mapping 요구 스킵 →
  제출 transactions를 **서버에서 재검증·정규화**(부호없는 정수·enum category·direction·날짜) 후 insert.
- CSV 경로(mock/live)·기존 검증은 불변.

## 데이터 흐름 / 보안

- PDF 셀·문자열은 **신뢰불가 입력.** 시스템 프롬프트에서 문서를 데이터로만 취급, 렌더는 기존 이스케이프 유지.
- 시크릿(`ANTHROPIC_API_KEY`)은 서버 전용. 추출은 서버 라우트에서만(클라이언트 직접 호출 금지).
- 금액은 부호 없는 정수 + `direction`. 환불·취소→income 정규화. 해외거래는 원화 청구액만.
- 업로드 cap은 추출 시점(비용 발생 지점)에 선검사.

## 에러 처리

- 잘못된 파일 형식/과대 크기/base64 불량 → 400 업무 메시지.
- Claude refusal/max_tokens(truncation) → 일반 실패 메시지 노출, 상세는 서버 로그.
- 추출 결과가 유효 거래 0건 → "거래내역을 찾지 못했습니다" 업무 메시지.
- cap 초과 → 402 기존 `FREE_UPLOAD_CAP_MESSAGE`.

## 테스트 (TDD)

- `src/lib/pdf/index.test.ts` — `assertPdfBytes`(매직바이트·크기), `normalizeExtractedTransactions`
  (날짜/금액/부호/환불 정규화, 불량 행 드롭, 카테고리 기본값).
- `src/app/api/uploads/extract/route.test.ts` — mock service로 성공, 입력검증 400, (live) cap 402, 인증 401.
- `src/app/api/uploads/route.test.ts` — PDF 분기: mapping 없이 transactions 검증·insert, 불량 거래 거부.
- `src/services/live/llm.test.ts` — `extractTransactions` 정규화 경로(Anthropic 호출 목킹).
- mock service 테스트에 `extractTransactions` fixture 추가.

## 스코프 밖 (기존 갭 / 로드맵)

- live FormData 재파싱 경로의 클라이언트 연결(CSV도 미연결).
- 원본 PDF Storage 저장(현 mock 경로는 파일 미저장 — 동작 경로와 일관).
- 다중 파일 병합·중복 감지, 페이지 정밀 카운트.
- 매우 큰 명세서(출력 토큰 상한 초과)는 truncation 에러로 노출 — MVP 단일 파일 전제.
