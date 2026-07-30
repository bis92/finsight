# 내부 분석 엔진 전환 설계 (LLM 사용 최소화)

작성일: 2026-07-30

## 목표

거래내역(CSV·PDF) 분석 파이프라인에서 **LLM 호출을 Pro 심층 분석에만** 남기고,
나머지는 모두 **내부 규칙/파서 엔진**으로 처리한다.

- **LLM 유지 (Opus, `claude-opus-4-8`):**
  - Pro 지출 진단 인사이트
  - Pro 구독(정기결제) 감지의 가맹점명 정규화·검증 단계
- **내부 엔진으로 전환 (LLM 제거):**
  - CSV 컬럼 자동매핑 (현재 Sonnet)
  - PDF 거래 추출 (현재 Sonnet 네이티브 PDF)
  - Free 인사이트 (현재 Sonnet)

전환 후 `@anthropic-ai/sdk`는 Pro 리포트 경로(`/api/pro-report`)에서만 쓰인다.

## 배경 (현재 구조)

| 단계 | 현재 | 위치 |
|------|------|------|
| CSV 컬럼 매핑 | Sonnet | `src/services/live/llm.ts` `mapColumns` |
| PDF 거래 추출 | Sonnet 네이티브 PDF | `src/services/live/llm.ts` `extractTransactions` |
| 거래 분류(카테고리) | **이미 규칙 기반** | `src/lib/analysis/index.ts` `classify` / `rules.ts` |
| Free 인사이트 | Sonnet | `src/services/live/llm.ts` `generateInsights(plan='free')` |
| Pro 진단 인사이트 | Opus | `src/services/live/llm.ts` `generateInsights(plan='pro')` |
| Pro 구독 감지 | 규칙 후보 + Opus 검증 | `src/lib/analysis/index.ts` `detectRuleSubscriptions` + `llm.ts` `detectSubscriptions` |

CSV 정규화 유틸(`normalizeDate`/`normalizeAmount`/방향판정)은 이미 `src/lib/csv/index.ts`에 존재하며,
CSV 별칭 사전은 `src/services/mock/llm.ts:15-43`에 존재한다. 본 설계는 이 자산을 재사용한다.

## 핵심 원칙

- **반환 계약 불변**: `ColumnMappingResult`, `NewTransaction[]`, `Insight[]` 의 형태를 바꾸지 않는다.
  → 프론트/`queries` UI 코드는 무변경 (CLAUDE.md: mock→live UI 불변 규칙).
- **내부 엔진은 순수 로직**: 외부 API가 없으므로 `LlmService` 시임이 아니라 `src/lib/` 순수 함수로 둔다.
  라우트 핸들러가 직접 호출한다. mock/live 분기 불필요(규칙은 결정적).
- **CSV 자산 재사용**: 별칭 사전과 정규화 함수를 CSV·PDF 양쪽에서 공유한다.

## 설계

### 1. CSV 컬럼 매핑 — 내부 규칙 엔진

- 신규: `src/lib/csv/mapping.ts` — `mapColumns(headers: string[], sampleRows: string[][]): ColumnMappingResult`
- 별칭 사전을 `src/services/mock/llm.ts`에서 `src/lib/csv/aliases.ts`로 추출해 공용화.
- 매칭 규칙: 공백·대소문자 무시, 부분 포함 허용. 첫 매칭 컬럼 인덱스 채택.
- `confidence`: 필수(date/merchant/amount) 전부 매칭 시 높음, category 누락은 감점만.
- 필수 컬럼 미매칭 시 `missingRequired`에 담아 반환 → 프론트의 기존 수동매핑/재확인 UX가 처리.
- 라우트 `src/app/api/uploads/mapping/route.ts`가 이 함수를 직접 호출(LlmService 미사용).

### 2. PDF 거래 추출 — 내부 파서 (제네릭 컬럼 감지, A안)

- 신규: `src/lib/pdf/extract.ts` — `extractTransactions(input: PdfExtractionInput): NewTransaction[]`
- 신규 의존성 **`unpdf`** (Vercel 서버리스 친화, pdfjs 내장 → 글자 x/y 좌표 획득).
- 알고리즘:
  1. 전체 페이지에서 텍스트 아이템(문자열 + x/y/width) 추출.
  2. 헤더 행을 별칭 사전(`src/lib/csv/aliases.ts`)으로 탐지 → 컬럼 x-구간 확정.
  3. 이후 행들을 y로 묶고 x-구간으로 셀 분배해 표 복원. 여러 페이지 순회.
  4. 셀 값에 기존 `normalizeDate`/`normalizeAmount`/방향판정 재사용 → `NewTransaction`.
  5. 정규화·검증은 기존 `src/lib/pdf/index.ts` `normalizeExtractedTransactions` 재사용.
- **폴백**: 헤더/표를 확신 있게 찾지 못하면 낮은 confidence로 판단하고,
  "자동 인식이 어렵습니다 — CSV로 업로드해 주세요" 검증 메시지 반환(스캔본·이상 포맷 방어).
  스캔/이미지 PDF(텍스트 아이템 0개)는 이 경로로 막힌다.
- 기존 매직넘버·10MB 크기 검증(`src/lib/pdf/index.ts`) 유지.
- 라우트 `src/app/api/uploads/extract/route.ts`가 이 함수를 직접 호출(LlmService 미사용).

### 3. Free 인사이트 — 템플릿 엔진

- 신규: `src/lib/analysis/insights.ts` — `buildFreeInsights(agg: AggregateSnapshot): Insight[]`
- 앱이 이미 계산한 집계값만 사용해 **사실 문장**을 생성(지어내지 않음):
  - 최상위 카테고리 비중: "이번 달 지출의 42%가 식비입니다"
  - 최상위 가맹점: "가장 많이 쓴 곳은 스타벅스(₩84,000)"
  - 수입 존재 시 순지출 한 줄
- `kind='summary'`만, `savingKrw` 없음. 조언·진단은 넣지 않음(그건 Pro/Opus 몫).
- 반환 계약(`Insight[]`) 동일 → UI 무변경.
- 라우트 `src/app/api/insights/route.ts`가 이 함수를 직접 호출(LlmService 미사용).

### 4. 배선 / 아키텍처 변경

- `LlmService`(`src/services/types.ts`) 시임을 **Opus 2개로 축소**:
  - Pro 진단 인사이트 생성
  - 구독 감지 검증(`detectSubscriptions`)
  - `mapColumns`/`extractTransactions`/Free `generateInsights`는 인터페이스에서 제거.
- `src/services/live/llm.ts`·`src/services/mock/llm.ts`에서 제거된 메서드 삭제, Opus 경로만 유지.
- `/api/pro-report`는 기존대로 `LlmService`(Opus) 사용.
- Pro 구독 감지: 규칙 후보(`detectRuleSubscriptions`) + Opus 검증 흐름 **그대로 유지**.

## 영향 / 트레이드오프

- **Free 인사이트 문장이 다소 기계적**이 된다(항상 정확·비용 0). 사용자 승인 완료.
- **PDF 인식률**: 텍스트 기반 표준 명세서는 A안으로 커버. 비정형·스캔본은 CSV로 유도(하드 실패 대신 안내).
- **비용/지연 감소**: 업로드마다 발생하던 Sonnet 호출 3종 제거 → Free 경로 LLM 비용 0.
- 향후 특정 카드사가 A안에서 깨지면 하이브리드(C안: 카드사별 오버라이드)로 점진 확장 가능.

## 테스트 전략 (TDD 선행 — tdd-guard 강제)

- `lib/csv/mapping.ts`: 별칭 매칭·신뢰도·누락컬럼 케이스.
- `lib/csv/aliases.ts`: 사전 완전성.
- `lib/pdf/extract.ts`: 좌표 텍스트 아이템 픽스처 → 표 복원, 다중 페이지, 헤더 미탐지 폴백, 스캔본(아이템 0) 폴백.
- `lib/analysis/insights.ts`: 집계값 → 문장 생성, 수입 유무, 빈 데이터.
- 라우트: 각 lib 함수 위임 확인.

## 범위 밖 (YAGNI)

- 카드사별 템플릿 파서(B안) 선제 구현 안 함.
- 스캔/이미지 PDF OCR 안 함.
- 다중 파일 병합·중복 감지(기존 로드맵 유지).
