# Step 9: landing-and-demo

## 읽어야 할 파일
- `/docs/PRD.md` (타겟, 가치 제안, 디자인 방향)
- `/docs/UI_GUIDE.md` (도구 느낌, AI 슬롭 안티패턴, 좌측 정렬, 색)
- `/docs/ARCHITECTURE.md` ((marketing) 라우트 그룹)
- 이전 step 산출물: `src/components/ui/`, step6 대시보드 컴포넌트(재사용), `src/services/mock`(샘플 fixtures)

## 작업
랜딩 페이지와 **게스트 샘플 데모**를 만든다.

1. **랜딩** (`src/app/(marketing)/page.tsx`): 히어로(가치 제안: "CSV 한 장으로 소비 정리"), 핵심 기능 요약, 가격 요약(→ pricing), 신뢰 요소("분석 후 원본 파기"), CTA 2개 — "샘플로 체험"(→ 데모), "시작하기"(→ 가입). UI_GUIDE 안티패턴(보라·glass·gradient orb·중앙정렬 남발) 금지.
2. **게스트 샘플 데모** (`src/app/(marketing)/demo/` 또는 공개 라우트): **가입 없이** step6 대시보드 컴포넌트를 **샘플 fixture로 렌더**(읽기전용). "내 파일로 해보기" CTA → 가입 유도. 저장·업로드는 불가(읽기전용).
3. 데모는 step6의 대시보드 표시 컴포넌트를 **재사용**한다(중복 구현 금지). 데이터 소스만 샘플 fixture로 주입.

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test
```

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 데모가 step6 대시보드 컴포넌트를 재사용하는가(새로 만들지 않음)?
   - 데모가 공개(비인증) 접근 가능하고 읽기전용인가?
   - 랜딩이 UI_GUIDE 안티패턴을 피하는가?
3. `phases/0-mvp-ui/index.json`의 step 9 업데이트(completed+summary / error).

## 금지사항
- 데모용 대시보드를 새로 구현하지 마라. 이유: step6 컴포넌트 재사용(재사용=확장성). 
- 게스트가 실제 CSV를 업로드/저장하게 하지 마라. 이유: 미가입 상태로 개인 금융데이터를 다루지 않는다(데모는 읽기전용 샘플).
- 랜딩에 "Powered by AI" 배지·gradient 텍스트·보라 브랜드색을 쓰지 마라. 이유: AI 슬롭 안티패턴.
