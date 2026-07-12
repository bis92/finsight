# Step 8: billing-ui

## 읽어야 할 파일
- `/docs/PRD.md` (Free/Pro 가격표, 기능 경계)
- `/docs/ADR.md` (ADR-004 Polar)
- `/docs/ARCHITECTURE.md` (결제 흐름, plan 갱신 경로, 강등 정책)
- `/CLAUDE.md` (plan 진실원천=profiles.plan)
- 이전 step 산출물: `src/services/`(profiles), `src/components/ui/`, step7 페이월 CTA

## 작업
가격표와 **업그레이드 플로우 UI**를 만든다. 실제 Polar 결제는 phase 1 — 여기선 mock 체크아웃으로 plan을 전환한다.

1. **가격표 화면** (`src/app/(marketing)/pricing/` 또는 대시보드 내): Free/Pro 비교표(PRD 기준). Pro CTA.
2. **mock 체크아웃**: "업그레이드" → mock 결제 완료 화면 → `profiles.setPlan('pro')`(mock) 반영. 실제 카드입력/외부 리다이렉트 없음(스텁).
3. **API** (`src/app/api/billing/checkout/route.ts`): mock 체크아웃 시작/완료 처리. plan 갱신은 서버 경로로.
4. **강등 UX**: Pro 해지/만료 시 free로 돌아가되 과거 데이터 열람 허용(step7 정책과 일치)을 UI로 반영.
5. 결제 취소/실패 시 free 유지로 복귀(안내 메시지, 서버 `message`).

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test
```

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - plan 전환이 서버 경로(`profiles`)로 반영되는가?
   - 실제 Polar SDK/키 없이 mock으로 동작하는가?
   - 가격표가 PRD의 Free/Pro 경계와 일치하는가?
3. `phases/0-mvp-ui/index.json`의 step 8 업데이트(completed+summary / error).

## 금지사항
- 실제 Polar SDK 연동·웹훅을 구현하지 마라. 이유: phase 1(`1-wire-up`) 대상.
- 가짜 카드폼으로 실제 결제를 흉내내 민감정보를 수집하지 마라. 이유: mock은 클릭 한 번으로 plan 전환만.
- 클라이언트 상태만으로 plan을 pro로 만들지 마라. 이유: 서버 profiles 경로로.
