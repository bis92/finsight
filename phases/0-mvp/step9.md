# Step 9: upload-mapping

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` (**업로드/매핑 화면 스펙의 단일 참조** — § "업로드 `/upload`" · "매핑 `/upload/mapping`", 드롭존 상태·파싱 요약·매핑 표·신뢰도 강조)
- `/CLAUDE.md` (LLM 비용 통제: 샘플 ≤20 · MVP 단일 파일 업로드 · category enum · 페칭 단일 경로)
- `/docs/PRD.md` (핵심기능 1: CSV 업로드 + 컬럼 자동매핑 + 사용자 확인 스텝 / 성공기준: 매핑 실패 시 수동 폴백)
- `/docs/UI_GUIDE.md` (매핑 확인 UI 규약 · 입력=Modal/좌측정렬 · 한국어 우선)
- `/docs/ADR.md` (ADR-004 컬럼 매핑은 AI + 사용자 확인)
- `/docs/ARCHITECTURE.md` (ColumnMapping 계약 · confidence<0.75/누락 시 수동 매핑)
- Step 1: `src/types/mapping.ts`
- Step 2: `src/lib/csv/` (인코딩감지·파싱·buildMappingInput·applyMapping)
- Step 6: `src/queries/uploads` (`useMappingPreview`, `useUpload`)
- Step 7: `src/components/ui/` (TopNav·Card·Button·MappingRow·FilterChip·Badge)

이전 step의 CSV 유틸·매핑 계약·업로드 훅을 꼼꼼히 읽고 조립하라.

## 작업

**DESIGN.md § 업로드/매핑 화면**을 두 라우트로 만든다: **`src/app/upload/page.tsx`**(드롭존) + **`src/app/upload/mapping/page.tsx`**(매핑 확인). 상단 TopNav 표시. MVP는 **단일 파일 업로드**.

플로우(DESIGN.md 화면 재현):

1. **`/upload` 드롭존** — `1/2 단계` 라벨 + 제목 + 안내. CSV 1개 업로드(Client Component), 대시된 보더 드롭존. 상태: **idle → parsing(`fs-spin` 스피너) → parsed**. 파일을 읽어 `detectEncoding`→`decodeCsv`→`parseCsv`(Step 2)로 headers/rows 확보(클라이언트 파싱, **매핑은 서버 LLM** 경유). parsed 시 파일 요약(예: 인코딩 `EUC-KR`·거래 35행·컬럼 7개 + 성공 배지). `컬럼 확인하기 →` → `/upload/mapping`.
   - CRITICAL: 다중 파일 병합·중복감지 UI를 만들지 마라. 이유: MVP는 단일 파일(로드맵 제외 항목). 단, 한 CSV에 여러 달 거래는 허용.
2. **매핑 요청** — `buildMappingInput`(sampleRows ≤20)으로 `useMappingPreview` mutation → `POST /api/uploads/mapping` → `ColumnMappingResult`.
   - CRITICAL: 전체 행을 매핑 요청에 넣지 마라(샘플 ≤20). 이유: LLM 비용 통제.
3. **`/upload/mapping` 매핑 확인** — `2/2 단계`. 안내 배너(**샘플 20행만 분석**). 매핑 표(MappingRow): 원본 컬럼 / 표준 필드 chip / 신뢰도. 각 컬럼에 "날짜/가맹점/금액/카테고리" 역할 드롭다운(**전 컬럼 선택 가능**). `무시` 필드 표시.
   - CRITICAL: `confidence < 0.75`(예: 업종 74%)면 **붉게 강조** + 자동 확정하지 말고 **수동 매핑 스텝**으로 유도(자동 진행 차단). `missingRequired`도 동일. 이유: ARCHITECTURE 시임 계약·매핑 신뢰도 리스크.
   - 매핑이 실패해도 업로드 전체가 막히지 않게(수동 매핑 폴백으로 항상 진행 가능). PRD 성공기준.
4. **확인 → 업로드 → 대시보드** — 사용자 확정 매핑으로 `applyMapping`(Step 2)해 `NewTransaction[]` 생성 → `useUpload` mutation → `POST /api/uploads`(insertMany, mock). 성공 시 `/dashboard`로 이동·집계 invalidate.
   - category는 서버/규칙 분류(Step 3)에 맡기고, 클라이언트가 자유 문자열 category를 강제 주입하지 않는다(enum만).

상태: 로딩/에러/빈 상태 표준 처리, 에러는 서버 `message` 그대로. 좌측 정렬(폼 중앙정렬 금지). 색/폰트는 DESIGN.md 토큰(`#0052ff` 액센트, mono 숫자, teal 금지).

## Acceptance Criteria

```bash
npm run build
npm test        # 매핑 확인 로직(confidence 게이트·샘플 상한) 테스트 통과
npm run lint
```

- 테스트 최소: `confidence<0.75` 또는 missingRequired가 있을 때 자동확정이 차단되고 수동 매핑이 요구되는지, 매핑 요청 payload의 sampleRows가 ≤20인지.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 매핑 요청이 샘플 ≤20행만 보내는가?
   - confidence<0.75/missingRequired 시 자동확정을 막고 수동 매핑을 요구하는가?
   - 단일 파일 업로드만 지원하는가(다중 병합 UI 없음)?
   - 데이터가 queries 훅 단일 경로인가? category enum만 다루는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 9를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "업로드/매핑 플로우 구성·게이트 조건 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 다중 파일 병합·중복감지 UI를 만들지 마라. 이유: MVP 로드맵 제외.
- 매핑 요청에 CSV 전체 행을 넣지 마라(≤20). 이유: LLM 비용 통제 CRITICAL.
- confidence<0.75/누락을 무시하고 자동 확정하지 마라. 이유: 매핑 신뢰도·사용자 확인 필수.
- 직접 fetch·services import·mock을 쓰지 마라(queries만). 기존 테스트를 깨뜨리지 마라.
