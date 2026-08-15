# FinSight Lighthouse Autoresearch Loop — 설계 문서

- 날짜: 2026-08-15
- 상태: 승인됨 (구현 계획 대기)
- 브랜치: `feat/lighthouse-autoresearch-loop`

## 목적

랜딩 페이지(`/`)의 웹 성능을 Lighthouse 점수로 측정하고, Karpathy의 `autoresearch`식
자율 반복 루프로 최적화를 계속 적용하다가 **목표 점수 도달 또는 정체** 시 멈춘다.
결정적 측정·판정은 스크립트/순수 함수가 맡고, 창의적 최적화는 Claude 서브에이전트가
iteration마다 1건씩 구현한다.

## autoresearch → 이 프로젝트 매핑

| autoresearch 구성 | 여기서의 구현 |
|---|---|
| 제어 루프 | 세션(메인 에이전트)이 `lighthouse-loop` 스킬을 따라 iteration 구동 |
| 평가자(Evaluator) | Lighthouse 측정 하네스 (`scripts/lighthouse/measure.mjs`) |
| 연구자(Researcher) | iteration마다 Agent 서브에이전트가 최적화 1건 구현 |
| 결정 로직 | `src/lib/perf/decision.ts` 순수 함수 (개선/회귀/정체 판정) |
| 연구 로그(Journal) | `docs/perf/lighthouse-loop-YYYY-MM-DD.md` |

## 결정 사항 (브레인스토밍 확정)

- **측정 대상**: 로컬 프로덕션 빌드 (`next build && next start`), 랜딩 `/` 단일 URL.
- **자율성**: 자율 적용 + git 체크포인트 (개선 시 commit, 악화 시 revert).
- **종료 조건**: 목표 점수 도달 OR 정체(N회 연속 개선 없음) OR 안전 상한.
- **범위**: Performance 집중, 4개 카테고리(Perf/A11y/Best Practices/SEO) 모두 추적(회귀 감지용).
- **구동 방식**: 하이브리드 — 측정 스크립트 + 결정 순수함수 + 서브에이전트.

## 컴포넌트

### 1. 측정 하네스 — `scripts/lighthouse/measure.mjs`

- 책임: 프로덕션 빌드 기동 → Lighthouse 실행 → 구조화 결과 출력 → 정리.
- 동작:
  1. (옵션) `next build` — 이미 빌드돼 있으면 스킵 플래그로 생략 가능.
  2. `next start`를 사용 가능한 포트로 기동, `/`가 200 될 때까지 대기.
  3. `chrome-launcher`로 headless Chrome 기동, `lighthouse`를 **3회 실행**해
     Performance 점수 기준 **median run**을 채택(변동성 완화).
  4. 서버·Chrome를 확실히 종료(finally에서 kill).
- 출력(JSON, stdout 또는 `--out <path>`):
  ```json
  {
    "url": "http://localhost:PORT/",
    "fetchedAt": "2026-08-15T...Z",
    "scores": { "performance": 0-100, "accessibility": ..., "best-practices": ..., "seo": ... },
    "metrics": { "lcp": ms, "tbt": ms, "cls": num, "fcp": ms, "si": ms },
    "opportunities": [ { "id": "unused-javascript", "title": "...", "savingsMs": num }, ... ]
  }
  ```
- 이유: side-effecting(프로세스 기동/네트워크)이므로 `scripts/`에 둔다(`smoke.sh` 선례).

### 2. 결정 로직 — `src/lib/perf/decision.ts` (테스트 선행)

순수 함수. `measure.mjs` 출력 형태의 결과 객체 두 개를 받아 판정한다.

- `compareScores(before, after, opts?)` → `{ improved: boolean, perfDelta: number }`
  - 개선 판정은 **노이즈 마진** 넘어야 함(기본: Performance +2점 이상, 또는 핵심 지표의 명확한 개선).
- `isRegression(before, after, opts?)` → `boolean`
  - Performance 외 카테고리가 임계(기본 -2점) 넘게 악화하면 회귀로 간주 → revert.
- `shouldStop(history, opts)` → `{ stop: boolean, reason: 'target' | 'plateau' | 'hardCap' | null }`
  - `target`: Performance ≥ targetScore(기본 95).
  - `plateau`: 최근 plateauN(기본 3)회 연속 개선 없음.
  - `hardCap`: iteration 수 ≥ hardCap(기본 15).
- 이유: `lib/` 비즈니스 로직 → CLAUDE.md TDD 규칙(tdd-guard) 적용, `decision.test.ts` 선행.

### 3. 루프 오케스트레이터 — 스킬 `.claude/skills/lighthouse-loop/`

세션이 이 스킬을 따라 반복. 각 iteration:

1. **측정**: `node scripts/lighthouse/measure.mjs --out <tmp>` 실행해 현재 점수 확보.
   첫 회는 baseline으로 기록하고 clean 상태 git 체크포인트 확인.
2. **최적화 제안·구현**: Agent 서브에이전트(general-purpose) dispatch.
   - 입력: 최신 Lighthouse 리포트(점수·opportunities·metrics), CLAUDE.md 규칙 요약.
   - 지시: "가장 임팩트 큰 성능 최적화 **1건만** 구현. `npm run build`와 `npm test`가
     통과하는지 검증. 변경 파일과 근거를 보고." (1건 = 격리·되돌리기 쉬움)
3. **재측정**: 다시 `measure.mjs` 실행.
4. **판정**: `compareScores` + `isRegression`. 빌드·테스트도 통과해야 keep.
5. **적용/롤백**:
   - keep: `git add -A && git commit` (iteration 커밋 메시지에 델타 기록).
   - drop: `git checkout . && git clean -fd`로 서브에이전트 변경 원복.
6. **기록**: Journal에 append.
7. **종료 판정**: `shouldStop` → 계속 or 종료.

### 4. 연구 로그 — `docs/perf/lighthouse-loop-YYYY-MM-DD.md`

- iteration별: before→after 4개 점수, perfDelta, 변경 요약, keep/revert, 사유.
- 마지막: baseline→final 요약표와 총 개선폭.

## 데이터 흐름

```
measure.mjs ──JSON(scores+audits)──▶ decision.ts(compare/stop)
     ▲                                        │
     │ 재측정                          continue?│ dispatch
     │                                         ▼
  git commit ◀──keep── 세션 판정 ◀──보고── Agent 서브에이전트(최적화 1건)
  git revert ◀──drop──                         (build+test 검증)
```

## 에러 처리

- 서브에이전트 변경 후 **빌드/테스트 실패** → revert, iteration 실패로 기록, 정체 카운트 +1.
- **개선 없음/노이즈 이내** → revert, 정체 카운트 +1.
- **다른 카테고리 회귀** → revert (Perf만 오르고 A11y/SEO 깨짐 방지).
- **Lighthouse 실행 실패** → 1회 재시도, 재실패 시 루프 중단(측정 불가 시 최적화 무의미).
- 매 iteration이 git 커밋 경계 → 임의 지점 롤백 가능.

## 종료 조건 (기본값, 설정 가능)

- 목표: Performance ≥ 95 → 종료(`target`).
- 정체: 3회 연속 개선 없음 → 종료(`plateau`).
- 안전 상한: 15 iteration → 강제 종료(`hardCap`).

## 의존성 & 범위

- 추가 devDependency: `lighthouse`, `chrome-launcher`. (headless Chrome은 시스템 Chrome 사용)
- 대상: 랜딩 `/` 단일 URL. 다른 라우트 확장은 로드맵(구현 안 함).
- npm 스크립트: `npm run lh:measure`(단발 측정)를 추가. 루프 자체는 스킬로 구동.

## 비범위 (YAGNI)

- 다중 URL/라우트 최적화, CI 통합(lighthouse-ci), 성능 예산 게이트, 히스토리 대시보드는 이번 범위 밖.
- 완전 headless `claude -p` 기반 무인 루프(세션 밖 실행)는 채택하지 않음(이 머신 제약·디버깅성).

## 테스트 전략

- `src/lib/perf/decision.test.ts`: `compareScores`/`isRegression`/`shouldStop`의
  경계값(노이즈 마진, 정체 카운트, 목표/상한) 테스트 선행(vitest).
- `measure.mjs`는 통합 스모크로 1회 수동 실행 검증(측정값이 나오는지). 프로세스 기동이라 유닛 테스트 제외.
