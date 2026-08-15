---
name: lighthouse-loop
description: 랜딩(/) 페이지를 Lighthouse로 측정하고 서브에이전트가 성능 최적화를 1건씩 자율 적용하며 목표(Performance≥95)·정체·상한까지 반복하는 autoresearch 루프. "라이트하우스 루프", "성능 최적화 루프 돌려줘", "성능 자동 최적화" 요청 시 사용.
---

# Lighthouse Autoresearch Loop

랜딩 `/` 성능을 자율 반복 최적화한다. 결정적 측정·판정은 도구가, 최적화는 서브에이전트가 맡는다.
설계·결정 근거: `docs/superpowers/specs/2026-08-15-lighthouse-autoresearch-loop-design.md`.

## 준비
- clean git 상태 확인(`git status`). 미커밋 변경이 있으면 사용자에게 먼저 정리 요청.
- Journal 파일 생성: `docs/perf/lighthouse-loop-<오늘날짜>.md` (헤더 + baseline 섹션).

## Baseline
1. `npm run lh:measure -- --out /tmp/lh-0.json` 실행.
2. 4개 카테고리 점수·metrics를 Journal에 baseline으로 기록.
3. `shouldStop([baseline])` 확인 — 이미 target이면 종료.

## 각 iteration (n = 1,2,…)
1. **최적화 dispatch**: general-purpose Agent 서브에이전트에게:
   - 최신 리포트 JSON(점수·opportunities·metrics)과 CLAUDE.md 아키텍처 규칙 요약 전달.
   - 지시: "가장 임팩트 큰 성능 최적화 **딱 1건만** 구현하라(예: next/image 전환, dynamic import,
     폰트 preload/display swap, next.config 최적화). `npm run build`와 `npm run test`가 통과해야 한다.
     변경 파일 목록과 근거를 보고하라. 여러 최적화를 섞지 마라."
2. **빌드·테스트 게이트**: 서브에이전트 보고와 무관하게 직접 `npm run build`·`npm run test` 확인.
   실패 시 → revert(아래).
3. **재측정**: `npm run lh:measure -- --skip-build --out /tmp/lh-<n>.json`.
   (서브에이전트가 이미 build 했으므로 `--skip-build` 사용. 소스 변경이 build에 반영돼야 하면 build 포함.)
4. **판정**: `compareScores(prev, curr)` + `isRegression(prev, curr)`를
   `src/lib/perf/decision.ts` 로직으로 계산. 예:
   `node --input-type=module -e "import {compareScores,isRegression} from './src/lib/perf/decision.ts'; ..."`
   (ts 직접 실행이 안 되면 두 JSON의 scores를 직접 대조: perfDelta≥2 이면 improved,
   accessibility/bestPractices/seo가 -2 넘게 하락하면 regression.)
5. **keep / revert**:
   - improved && !regression && 빌드·테스트 통과 → `git add -A && git commit -m "perf: <요약> (perf +Δ)"`.
     curr을 prev로 승격.
   - 아니면 → `git checkout . && git clean -fd`로 원복. 정체 카운트 +1.
6. **Journal 기록**: iteration 번호, before→after 4점수, perfDelta, 변경 요약, keep/revert, 사유.
7. **종료 판정**: `shouldStop(history)` — target/plateau/hardCap이면 루프 종료.

## 종료 시
- Journal에 baseline→final 요약표와 총 개선폭, 종료 사유 기록.
- 사용자에게 최종 점수와 적용된 최적화 목록 보고.

## 에러 처리
- Lighthouse 실행 실패 → 1회 재시도, 재실패 시 루프 중단하고 사용자에게 보고.
- 매 iteration이 git 커밋 경계이므로 어느 지점으로든 롤백 가능.
