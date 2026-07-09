# Step 7: pro-insights-ui

## 읽어야 할 파일
- `/docs/PRD.md` (Free/Pro 경계, Pro 앵커=심화 인사이트·정기구독 탐지)
- `/docs/ARCHITECTURE.md` (LlmService, 강등 시 열람 허용/기능만 잠금)
- `/CLAUDE.md` (plan 진실원천=profiles.plan, 클라 plan 불신)
- 이전 step 산출물: `src/services/`(mock LlmService: generateInsights/detectSubscriptions, profiles), `src/components/ui/`, `src/queries/`, step6 대시보드

## 작업
Pro 티어 화면(심화 인사이트 + 정기구독 탐지)과 **페이월 게이팅**을 만든다. 데이터는 mock.

1. **API** (`src/app/api/insights/route.ts`): `LlmService.generateInsights(집계 스냅샷)` + `detectSubscriptions(txns)` 반환. **서버에서 profiles.plan 확인** — free면 실제 내용 대신 잠금 응답. `{ message }` 봉투.
2. **인사이트 카드**: "외식 32%↑, 주말 배달이 원인" 류 심화 인사이트 표시(Pro).
3. **정기구독 탐지 카드**: 반복결제 목록 + 절감 제안(Pro).
4. **페이월**: free 사용자에겐 카드의 **존재/개수는 보여주되 내용은 블러 + 업그레이드 CTA**(→ step8 결제). plan 게이팅은 **서버가 내려준 profiles.plan** 기준(클라가 보낸 plan 신뢰 금지).
5. **강등 정책**: plan이 free로 돌아가면 과거 인사이트 **열람은 허용하되 심화 기능만 잠금**(데이터 삭제 금지).
6. mock에서 plan 전환을 확인할 수 있게(예: mock profile free↔pro) 게이팅이 동작함을 보인다.

## Acceptance Criteria
```bash
npm run lint
npm run build
npm run test   # 게이팅 로직(free→잠금 응답, pro→내용) 테스트 포함
```

## 검증 절차
1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - 게이팅이 **서버측 profiles.plan**으로 강제되는가(클라 토글로 내용이 열리지 않는가)?
   - free일 때 Pro 내용이 API 응답에 실제로 담기지 않는가(블러는 UI가 아니라 데이터 차단)?
   - LlmService를 `services/` 뒤에서 쓰는가?
3. `phases/0-mvp-ui/index.json`의 step 7 업데이트(completed+summary / error).

## 금지사항
- 클라이언트가 보낸 plan 값으로 Pro를 해제하지 마라. 이유: profiles.plan이 유일한 진실원천. 우회 위험.
- free 응답에 Pro 실제 내용을 담아 CSS로만 가리지 마라. 이유: 데이터 레벨에서 차단해야 한다.
- 실제 Claude를 호출하지 마라. 이유: phase 1. mock LlmService 사용.
