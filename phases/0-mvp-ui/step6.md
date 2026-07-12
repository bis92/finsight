# Step 6: dashboard-free

## 읽어야 할 파일
- `/docs/PRD.md` (Free 기능 범위, 순지출 개념)
- `/docs/UI_GUIDE.md` (읽기전용 상세=SideView, 수정=Modal, 숫자 tabular-nums, 차트 색)
- `/docs/ARCHITECTURE.md` (집계는 transactions 파생, 단일 페칭 경로)
- `/CLAUDE.md` (category enum, 환불=income → 순지출)
- 이전 step 산출물: `src/types/`, `src/services/`(mock repo), `src/components/ui/`(Card, Drawer, Modal), `src/queries/`, `src/lib/`

## 작업
Free 티어 소비 대시보드를 만든다. 데이터는 mock repository에서.

1. **집계 로직** (`src/lib/`): transactions에서 파생 계산 — 카테고리별 지출, 상위 가맹점, 총지출/총수입, **순지출(지출−환입)**, 월 요약. 순수 함수 + 테스트.
2. **API** (`src/app/api/analyses/route.ts`): 위 집계를 반환(mock repo의 transactions 기반). `{ message }` 에러 봉투.
3. **대시보드 화면** (`src/app/dashboard/`): 카테고리별 지출(파이/도넛), 상위 가맹점(바/리스트), 총계 카드, 거래 리스트. `queries`로 페칭. 금액은 `tabular-nums`·천단위.
4. **거래 상세 = SideView**: 거래 클릭 시 우측 **Drawer**로 읽기전용 상세(원본 raw 포함). (Modal 아님)
5. **재분류 = Modal**: 오분류 수정은 category enum 선택 **Modal** → `reclassify` → 집계 갱신.
6. **Empty state**: 거래 0건이면 "첫 명세서를 올려보세요" 유도(업로드로 링크). 단일 월이면 추이 대신 구성 위주.
7. 차트는 경량으로. 무거운 의존성 지양(간단한 차트 라이브러리 또는 자체 SVG/CSS). UI_GUIDE 색·안티패턴 준수.

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test   # 집계 순수함수 테스트(순지출·카테고리 합계·상위 가맹점) 포함
```

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 집계가 `transactions`에서 파생되는가(별도 집계 테이블 없음)?
   - 순지출이 환불(income)을 반영하는가?
   - 상세가 **SideView**, 재분류가 **Modal**인가?
   - category가 enum으로만 표시/선택되는가?
3. `phases/0-mvp-ui/index.json`의 step 6 업데이트(completed+summary / error).

## 금지사항
- Pro 전용(심화 인사이트·정기구독 탐지)을 여기서 만들지 마라. 이유: step 7 범위.
- 거래 상세를 Modal로 열지 마라. 이유: 읽기전용=SideView 규약.
- 무거운 차트/대시보드 프레임워크를 도입하지 마라. 이유: MVP 경량 유지.
