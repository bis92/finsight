# Step 2: upload-pipeline-live

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CSV 전체 행을 LLM에 넣지 마라 · 컬럼 매핑은 샘플 ≤20행만 · 실제 거래 분류는 규칙 기반 + 배치 · 업로드 CSV는 비공개 Storage + signed URL · 내부 예외 노출 금지 · `amount` 부호 없는 정수+`direction`)
- `/docs/ARCHITECTURE.md` ("데이터 흐름" 단일 경로 · Route Handler는 데이터 접근 단일 진입점 · `uploads` status `parsing|done|error`)
- `/docs/ADR.md` (ADR-004 컬럼 매핑은 AI·거래 분류는 규칙 기반 + 배치, ADR-009 원본 저장)
- `/src/app/api/uploads/route.ts` (현재 mock 업로드 처리 — 이 라우트에 live 경로를 배선한다)
- `/src/app/api/_lib/server.ts` (`withErrorBoundary`·`requireConfirmedMapping`·`requireTransactions`·`CURRENT_USER_ID`·`ApiRouteError` — 재사용)
- `/src/lib/csv/index.ts` (`detectEncoding`·`decodeCsv`·`parseCsv`·`applyMapping` — CSV 파싱은 여기에만 있다. LLM 미사용)
- Step 0 산출물: `/src/services/live/transactions.ts` (`insertMany` — 파싱된 거래 영속화)
- Step 1 산출물: `/src/services/live/uploads.ts` (`createUpload`·`setUploadStatus`), `/src/lib/supabase/storage.ts` (서명 URL 헬퍼)
- `2-auth` 산출물: `/src/lib/auth/session.ts` (`getAuthenticatedUserId` — live 경로의 사용자 식별)

이전 코드를 꼼꼼히 읽고 업로드 파이프라인과 비용 통제 규칙을 이해한 뒤 작업하라.

## 배경

phase 3는 mock을 유지한 채 live 구현만 추가한다(컷오버는 6-launch). 이 step은 `POST /api/uploads`의 처리 로직에 **live 경로**를 배선한다: 업로드된 CSV를 파싱해 `transactions`로 DB 영속화하고, `uploads.status`를 `parsing→done|error`로 전이한다. 라우트는 `getDataSource()`에 따라 mock/live 경로를 고르되, **mock 경로는 그대로 유지**한다.

## 작업

**TDD 필수** — 파이프라인(파싱→저장→status 전이)을 Supabase/서비스 목킹 단위 테스트로 먼저 고정한다. 실네트워크·실LLM 금지.

1. **`POST /api/uploads` live 경로 배선** — `src/app/api/uploads/route.ts` (필요 시 파싱 로직은 `src/lib/` 또는 라우트 `_lib`에 순수 함수로 분리)
   - `getDataSource() === 'live'`일 때:
     1. 사용자 식별: `getAuthenticatedUserId()`(2-auth). `CURRENT_USER_ID` 스텁은 live 경로에서 쓰지 않는다.
     2. 확정 매핑 검증: 기존 `requireConfirmedMapping`으로 클라이언트가 보낸 확정 매핑을 검증한다.
     3. 원본 CSV 처리: 업로드 파일 바이트를 `detectEncoding`→`decodeCsv`→`parseCsv`로 파싱하고, `applyMapping(headers, rows, mapping)`으로 `NewTransaction[]`을 만든다. **파싱·정규화는 전적으로 `src/lib/csv`가 담당**한다.
     4. `uploads` 레코드: `createUpload(userId, originalName, filePath)`로 `status='parsing'` 레코드 생성(파일 경로는 Step 1 컨벤션 `<userId>/<uploadId 또는 파일명>`). 원본 파일은 비공개 Storage에 저장/서명 업로드(Step 1 헬퍼).
     5. 거래 영속화: 파싱된 거래를 Step 0 `insertMany(userId, txns)`로 저장한다. 저장할 때 각 거래의 `uploadId`를 방금 만든 upload id로 채운다.
     6. status 전이: 성공 시 `setUploadStatus(userId, uploadId, 'done')`, 파싱/저장 실패 시 `setUploadStatus(userId, uploadId, 'error', <내부 안전 메시지>)`. 최종 `Upload` 상태를 응답으로 반환(mock 경로와 동일 형태).
   - `getDataSource() === 'mock'`이면 **기존 mock 처리(현재 코드)를 그대로** 실행한다.

2. **핵심 규칙 (CRITICAL)**
   - **CSV 전체 행을 LLM에 넣지 마라.** 이 파이프라인은 LLM을 호출하지 않는다 — 파싱은 `lib/csv`, 저장은 transactions repo. 컬럼 매핑(샘플 ≤20행 LLM)은 별도 라우트(`/api/uploads/mapping`) 소관이며 여기서 다시 호출하지 않는다. 이유: ADR-004·CLAUDE.md — LLM 비용·지연 폭증 방지.
   - **거래 분류는 규칙 기반**(`applyMapping`의 `direction`/기본 category 규칙)으로 한다. 여기서 행별 LLM 분류를 붙이지 마라.
   - **`amount`는 부호 없는 정수+`direction`**으로만 저장(`lib/csv`가 이미 정규화). 부호 저장 금지.
   - **원본 CSV는 비공개 Storage + 서명 URL**로만 다룬다(Step 1). 공개 경로에 쓰지 마라.
   - **내부 예외를 사용자 메시지로 노출하지 마라.** 파싱/DB 실패의 상세는 `console.error` + `uploads.error_message`(서버측)로만 남기고, 응답 5xx는 일반 문구(`withErrorBoundary`)로 덮는다. 의도된 검증 메시지(매핑 누락 등)는 그대로 노출.

3. **MVP 범위**
   - 단일 파일 업로드만. 다중파일 병합·중복감지는 로드맵 — 구현하지 마라.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(서비스/Supabase 목킹, 실네트워크·실LLM 없음):
  - live 경로에서 CSV 바이트가 `lib/csv`로 파싱되어 `insertMany`에 `NewTransaction[]`으로 전달되고, upload가 `parsing→done`으로 전이한다.
  - 파싱/저장 실패 시 `parsing→error`로 전이하고, 응답이 내부 상세를 노출하지 않는다(일반 문구).
  - live 경로가 LLM 서비스를 **호출하지 않음**을 검증(mapColumns/generateInsights 미호출).
  - `getDataSource='mock'`일 때 기존 mock 경로가 그대로 동작한다(회귀 없음).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - CSV 파싱이 `lib/csv`로만, 저장이 transactions repo로만 이뤄지는가? LLM 호출이 파이프라인에 없는가?
   - status 전이(`parsing→done|error`)가 정확한가?
   - 원본 CSV가 비공개 Storage(서명 URL)에만 저장되는가?
   - 5xx가 일반 문구로 덮이고 상세는 서버 로그/`error_message`에만 있는가?
   - live 경로가 `getAuthenticatedUserId`로 사용자를 식별하고, mock 경로는 불변인가?
3. 결과에 따라 `phases/3-data-live/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "업로드 파이프라인 live 배선·파싱→저장→status 전이·에러정책 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- CSV 전체 행(또는 행별 분류)을 LLM에 보내지 마라. 이유: ADR-004·CLAUDE.md CRITICAL — 비용·지연 폭증. 파싱은 `lib/csv`, 분류는 규칙 기반.
- 업로드 매핑 LLM 호출(`mapColumns`)을 이 파이프라인에서 다시 하지 마라. 이유: 매핑은 `/api/uploads/mapping` 소관, 기본 경로 LLM 호출 상한.
- 원본 CSV를 공개 Storage/공개 URL로 저장하지 마라. 이유: 개인 금융 PII(ADR-009).
- 내부 예외(파싱/DB 스택·원문)를 응답 body로 내보내지 마라. 이유: 정보 노출 방지(의도된 검증 메시지는 예외).
- `amount`를 부호로 저장하지 마라. 이유: 집계가 깨진다.
- 다중파일 병합·중복감지를 구현하지 마라. 이유: MVP는 단일 파일, 나머지는 로드맵.
- mock 업로드 경로나 `DATA_SOURCE` 기본값을 바꾸지 마라. 이유: 이 phase는 mock 동작 유지, 컷오버는 6-launch.
- 기존 테스트를 깨뜨리지 마라.
