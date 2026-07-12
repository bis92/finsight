# Step 5: csv-upload-ui

## 읽어야 할 파일
- `/docs/ARCHITECTURE.md` (데이터 흐름, 시임, 인코딩 파이프라인, LLM 매핑 실패 폴백, 에러 봉투)
- `/docs/UI_GUIDE.md` (수정=Modal 규약, 폼/버튼)
- `/CLAUDE.md` (mock은 /api 뒤, 단일 파일, 에러 message 규약)
- 이전 step 산출물: `src/lib/csv/`(파서), `src/types/`, `src/services/`(mock repo, LlmService), `src/components/ui/`(Modal, Button, Input, Card)

## 작업
단일 CSV 업로드 → 자동매핑 → **확인 스텝** → 확정까지의 화면·API를 만든다. 데이터는 mock repository에 저장.

1. **업로드 화면** (`src/app/dashboard/upload/` 또는 컴포넌트): **단일 파일** 선택/드롭. 확장자·MIME·최대 크기(예 10MB) 검증. 다중 파일 UI 금지.
2. **API** (`src/app/api/uploads/route.ts`): 파일 수신 → (mock) Storage 저장 스텁 → `lib/csv`로 인코딩 감지·디코딩·파싱 → `LlmService.mapColumns(샘플행 ≤20)` → 파싱 프리뷰 + 매핑 반환. 에러는 `{ message }` 봉투.
3. **매핑 확인 스텝**: "이렇게 읽었어요"(날짜=A·가맹점=B·금액=C…) 미리보기 표 + 상위 몇 행 프리뷰. 사용자가 확정.
4. **수정 = Modal**: 매핑이 틀리면 컬럼 수동 매핑 **Modal**(step1 `Modal`)로 조정 후 재확정. (인라인/SideView 편집 금지)
5. **인코딩 수동 선택 폴백**: 프리뷰가 깨져 보이면 인코딩(UTF-8/EUC-KR) 드롭다운으로 다시 디코딩.
6. **LLM 매핑 실패 폴백**: `mapColumns` 결과를 스키마 검증 → 실패면 자동으로 수동 매핑 스텝으로. (mock은 정상 반환하나 폴백 경로를 구현해 둔다)
7. **확정 시**: `buildTransactions` → `TransactionsRepository.insertMany` → 완료 후 대시보드로.
8. 에러 상태: 빈/깨진 파일, 상한 초과, 거래 0건 → 원인을 담은 서버 `message` 노출.
9. 데이터 페칭/뮤테이션은 `queries` + `apiClient` 경유.

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test
```
업로드 API 핸들러 로직(파싱→매핑→검증 폴백)과 매핑 확인 컴포넌트에 테스트 포함.

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 매핑 **확인 스텝**이 존재하고, 수정이 **Modal**로 이뤄지는가?
   - 단일 파일만 받는가(다중 업로드 없음)?
   - API가 mock repository/LlmService를 `services/` 뒤에서 쓰는가(클라가 직접 mock 접근 안 함)?
   - 에러가 `{ message }`로 정규화되고 내부 예외가 노출되지 않는가?
3. `phases/0-mvp-ui/index.json`의 step 5 업데이트(completed+summary / error).

## 금지사항
- 다중 파일 업로드/병합/중복감지를 구현하지 마라. 이유: MVP 단일 파일.
- 실제 Claude/Storage를 호출하지 마라. 이유: phase 1. 여기선 mock `LlmService`·스텁 Storage.
- 매핑 수정을 SideView나 인라인으로 하지 마라. 이유: 수정=Modal 규약.
