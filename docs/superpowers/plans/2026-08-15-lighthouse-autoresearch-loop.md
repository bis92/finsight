# Lighthouse Autoresearch Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜딩 `/` 페이지의 Lighthouse 점수를 측정하고, 서브에이전트가 최적화를 1건씩 자율 적용하며 목표 도달/정체까지 반복하는 autoresearch 루프를 구축한다.

**Architecture:** 결정적 파트(측정·판정)는 스크립트/순수함수가 맡고, 창의적 최적화는 세션이 스킬을 따라 Agent 서브에이전트로 iteration마다 1건씩 구현한다. 측정 하네스(`scripts/lighthouse/measure.mjs`)가 프로덕션 빌드를 Lighthouse로 3회 측정해 median JSON을 내고, 순수 결정 로직(`src/lib/perf/decision.ts`)이 개선/회귀/정체를 판정하며, 스킬(`.claude/skills/lighthouse-loop/`)이 git 체크포인트로 keep/revert를 오케스트레이션한다.

**Tech Stack:** Node 22 (ESM), Next.js 15, `lighthouse` + `chrome-launcher`(신규 devDep), vitest, Claude Code Agent 서브에이전트.

**Spec:** `docs/superpowers/specs/2026-08-15-lighthouse-autoresearch-loop-design.md`

## Global Constraints

- 순수 로직/유틸은 `src/lib/`, side-effecting 스크립트는 `scripts/`. (CLAUDE.md)
- `lib/` 비즈니스 로직은 **테스트 선행(TDD)**. (CLAUDE.md, tdd-guard 훅)
- 커밋 메시지는 conventional commits (`feat:`, `docs:`, `chore:` …). (CLAUDE.md)
- vitest alias: `@` → `src`. 테스트는 대상과 같은 디렉터리에 `*.test.ts`.
- 측정 대상은 **로컬 프로덕션 빌드(`next build && next start`)의 랜딩 `/` 단일 URL**.
- 종료 기본값: Performance ≥ 95(target) / 3회 정체(plateau) / 15 iteration(hardCap).
- 개선 노이즈 마진: Performance +2점. 회귀 마진: 타 카테고리 -2점.

## File Structure

- `src/lib/perf/decision.ts` — 순수 결정 로직 + 공유 타입. (신규)
- `src/lib/perf/decision.test.ts` — 위 로직의 vitest 테스트. (신규)
- `scripts/lighthouse/measure.mjs` — 측정 하네스(빌드·기동·Lighthouse·median·JSON). (신규)
- `.claude/skills/lighthouse-loop/SKILL.md` — 루프 오케스트레이션 스킬. (신규)
- `package.json` — devDep(`lighthouse`, `chrome-launcher`) + `lh:measure` 스크립트. (수정)

---

### Task 1: perf 결정 로직 — 타입 + `compareScores`

**Files:**
- Create: `src/lib/perf/decision.ts`
- Test: `src/lib/perf/decision.test.ts`

**Interfaces:**
- Consumes: (없음)
- Produces:
  - `type CategoryScores = { performance: number; accessibility: number; bestPractices: number; seo: number }`
  - `type LighthouseReport = { url: string; fetchedAt: string; scores: CategoryScores; metrics: { lcp: number; tbt: number; cls: number; fcp: number; si: number }; opportunities: Array<{ id: string; title: string; savingsMs: number }> }`
  - `function compareScores(before: LighthouseReport, after: LighthouseReport, opts?: { perfNoiseMargin?: number }): { improved: boolean; perfDelta: number }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/perf/decision.test.ts
import { describe, expect, it } from 'vitest'

import { compareScores, type LighthouseReport } from './decision'

function report(performance: number, overrides: Partial<LighthouseReport['scores']> = {}): LighthouseReport {
  return {
    url: 'http://localhost:3100/',
    fetchedAt: '2026-08-15T00:00:00.000Z',
    scores: { performance, accessibility: 100, bestPractices: 100, seo: 100, ...overrides },
    metrics: { lcp: 2000, tbt: 100, cls: 0, fcp: 1000, si: 1500 },
    opportunities: [],
  }
}

describe('compareScores', () => {
  it('reports perfDelta as after minus before', () => {
    expect(compareScores(report(70), report(78)).perfDelta).toBe(8)
    expect(compareScores(report(80), report(75)).perfDelta).toBe(-5)
  })

  it('marks improved only when perfDelta meets the noise margin (default 2)', () => {
    expect(compareScores(report(80), report(82)).improved).toBe(true)
    expect(compareScores(report(80), report(81)).improved).toBe(false)
    expect(compareScores(report(80), report(80)).improved).toBe(false)
  })

  it('respects a custom noise margin', () => {
    expect(compareScores(report(80), report(84), { perfNoiseMargin: 5 }).improved).toBe(false)
    expect(compareScores(report(80), report(85), { perfNoiseMargin: 5 }).improved).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/perf/decision.test.ts`
Expected: FAIL — `compareScores`/`LighthouseReport` not exported (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/perf/decision.ts
export type CategoryScores = {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
}

export type LighthouseReport = {
  url: string
  fetchedAt: string
  scores: CategoryScores
  metrics: { lcp: number; tbt: number; cls: number; fcp: number; si: number }
  opportunities: Array<{ id: string; title: string; savingsMs: number }>
}

const DEFAULT_PERF_NOISE_MARGIN = 2

export function compareScores(
  before: LighthouseReport,
  after: LighthouseReport,
  opts: { perfNoiseMargin?: number } = {},
): { improved: boolean; perfDelta: number } {
  const margin = opts.perfNoiseMargin ?? DEFAULT_PERF_NOISE_MARGIN
  const perfDelta = after.scores.performance - before.scores.performance
  return { improved: perfDelta >= margin, perfDelta }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/perf/decision.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/perf/decision.ts src/lib/perf/decision.test.ts
git commit -m "feat(perf): compareScores로 Lighthouse 개선 판정 추가"
```

---

### Task 2: `isRegression` — 타 카테고리 회귀 감지

**Files:**
- Modify: `src/lib/perf/decision.ts`
- Test: `src/lib/perf/decision.test.ts`

**Interfaces:**
- Consumes: `LighthouseReport` (Task 1)
- Produces: `function isRegression(before: LighthouseReport, after: LighthouseReport, opts?: { categoryMargin?: number }): boolean`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/perf/decision.test.ts`:

```ts
import { isRegression } from './decision'

describe('isRegression', () => {
  it('returns false when non-performance categories hold or improve', () => {
    const before = report(70)
    const after = report(90) // 성능만 오르고 나머지는 100 유지
    expect(isRegression(before, after)).toBe(false)
  })

  it('flags regression when accessibility drops beyond the margin (default 2)', () => {
    const before = report(70)
    const after = report(90, { accessibility: 97 }) // 100 -> 97, -3
    expect(isRegression(before, after)).toBe(true)
  })

  it('ignores drops within the margin', () => {
    const before = report(70)
    const after = report(90, { seo: 98 }) // 100 -> 98, -2, 마진 이내
    expect(isRegression(before, after)).toBe(false)
  })

  it('ignores performance drops (performance is the optimization target, not a regression source)', () => {
    const before = report(90)
    const after = report(80)
    expect(isRegression(before, after)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/perf/decision.test.ts`
Expected: FAIL — `isRegression` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/perf/decision.ts`:

```ts
const DEFAULT_CATEGORY_MARGIN = 2

export function isRegression(
  before: LighthouseReport,
  after: LighthouseReport,
  opts: { categoryMargin?: number } = {},
): boolean {
  const margin = opts.categoryMargin ?? DEFAULT_CATEGORY_MARGIN
  const guarded: Array<keyof CategoryScores> = ['accessibility', 'bestPractices', 'seo']
  return guarded.some((key) => after.scores[key] < before.scores[key] - margin)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/perf/decision.test.ts`
Expected: PASS (모든 테스트).

- [ ] **Step 5: Commit**

```bash
git add src/lib/perf/decision.ts src/lib/perf/decision.test.ts
git commit -m "feat(perf): isRegression으로 타 카테고리 회귀 감지 추가"
```

---

### Task 3: `shouldStop` — 종료 조건 판정

**Files:**
- Modify: `src/lib/perf/decision.ts`
- Test: `src/lib/perf/decision.test.ts`

**Interfaces:**
- Consumes: (Task 1 타입은 불필요 — 독립 입력)
- Produces:
  - `type IterationRecord = { performance: number; improved: boolean }`
  - `type StopReason = 'target' | 'plateau' | 'hardCap' | null`
  - `function shouldStop(history: IterationRecord[], opts?: { targetScore?: number; plateauN?: number; hardCap?: number }): { stop: boolean; reason: StopReason }`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/perf/decision.test.ts`:

```ts
import { shouldStop, type IterationRecord } from './decision'

function history(records: Array<[number, boolean]>): IterationRecord[] {
  return records.map(([performance, improved]) => ({ performance, improved }))
}

describe('shouldStop', () => {
  it('does not stop on empty history', () => {
    expect(shouldStop([])).toEqual({ stop: false, reason: null })
  })

  it('stops with reason target when latest performance meets targetScore (default 95)', () => {
    expect(shouldStop(history([[90, true], [96, true]]))).toEqual({ stop: true, reason: 'target' })
  })

  it('stops with reason plateau after plateauN consecutive non-improvements (default 3)', () => {
    expect(shouldStop(history([[80, true], [80, false], [80, false], [80, false]]))).toEqual({
      stop: true,
      reason: 'plateau',
    })
  })

  it('does not plateau-stop when improvements are interleaved', () => {
    expect(shouldStop(history([[80, false], [82, true], [82, false]]))).toEqual({ stop: false, reason: null })
  })

  it('stops with reason hardCap when iteration count reaches the cap', () => {
    const many = history(Array.from({ length: 15 }, () => [80, true] as [number, boolean]))
    expect(shouldStop(many)).toEqual({ stop: true, reason: 'hardCap' })
  })

  it('prefers target over hardCap when both hold', () => {
    const many = history(Array.from({ length: 15 }, (_, i) => [i === 14 ? 96 : 80, true] as [number, boolean]))
    expect(shouldStop(many)).toEqual({ stop: true, reason: 'target' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/perf/decision.test.ts`
Expected: FAIL — `shouldStop`/`IterationRecord` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/perf/decision.ts`:

```ts
export type IterationRecord = { performance: number; improved: boolean }
export type StopReason = 'target' | 'plateau' | 'hardCap' | null

const DEFAULT_TARGET_SCORE = 95
const DEFAULT_PLATEAU_N = 3
const DEFAULT_HARD_CAP = 15

export function shouldStop(
  history: IterationRecord[],
  opts: { targetScore?: number; plateauN?: number; hardCap?: number } = {},
): { stop: boolean; reason: StopReason } {
  const targetScore = opts.targetScore ?? DEFAULT_TARGET_SCORE
  const plateauN = opts.plateauN ?? DEFAULT_PLATEAU_N
  const hardCap = opts.hardCap ?? DEFAULT_HARD_CAP

  if (history.length === 0) return { stop: false, reason: null }

  const latest = history[history.length - 1]
  if (latest.performance >= targetScore) return { stop: true, reason: 'target' }

  if (history.length >= plateauN) {
    const recent = history.slice(-plateauN)
    if (recent.every((r) => !r.improved)) return { stop: true, reason: 'plateau' }
  }

  if (history.length >= hardCap) return { stop: true, reason: 'hardCap' }

  return { stop: false, reason: null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/perf/decision.test.ts`
Expected: PASS (모든 테스트).

- [ ] **Step 5: Commit**

```bash
git add src/lib/perf/decision.ts src/lib/perf/decision.test.ts
git commit -m "feat(perf): shouldStop으로 목표·정체·상한 종료 판정 추가"
```

---

### Task 4: 측정 의존성 설치 + npm 스크립트

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: (없음)
- Produces: `npm run lh:measure` — `node scripts/lighthouse/measure.mjs` 실행 진입점.

- [ ] **Step 1: devDependency 설치**

Run:
```bash
npm install -D lighthouse chrome-launcher
```
Expected: `package.json`의 `devDependencies`에 `lighthouse`, `chrome-launcher` 추가, `package-lock.json` 갱신.

- [ ] **Step 2: npm 스크립트 추가**

`package.json`의 `scripts`에 아래 항목 추가(기존 항목 유지):
```json
"lh:measure": "node scripts/lighthouse/measure.mjs"
```

- [ ] **Step 3: 설치 확인**

Run: `npx --no-install lighthouse --version`
Expected: 버전 문자열 출력(예: `12.x.x`). "NOT installed"가 아니어야 함.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(perf): lighthouse·chrome-launcher devDep + lh:measure 스크립트 추가"
```

---

### Task 5: 측정 하네스 `measure.mjs`

**Files:**
- Create: `scripts/lighthouse/measure.mjs`

**Interfaces:**
- Consumes: `lighthouse`, `chrome-launcher`(Task 4), `./node_modules/.bin/next`.
- Produces: 실행 시 `Task 1`의 `LighthouseReport` JSON을 stdout(및 `--out <path>` 지정 시 파일)로 출력. CLI: `node scripts/lighthouse/measure.mjs [--out <path>] [--skip-build] [--runs <n>] [--port <n>]`.

- [ ] **Step 1: 하네스 작성**

```js
// scripts/lighthouse/measure.mjs
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'

import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = args[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const outPath = flag('out', null)
const skipBuild = flag('skip-build', false) === true
const runs = Number(flag('runs', 3))
const wantedPort = flag('port', null)

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function run(cmd, cmdArgs, opts = {}) {
  const child = spawn(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    child.on('error', reject)
  })
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' })
      if (res.status > 0) return
    } catch {
      // 서버 아직 안 뜸
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`server not ready at ${url}`)
}

function toReport(lhr, url) {
  const cat = lhr.categories
  const audit = (id) => lhr.audits[id]?.numericValue ?? 0
  const opportunities = Object.values(lhr.audits)
    .filter((a) => a.details?.type === 'opportunity' && (a.details.overallSavingsMs ?? 0) > 0)
    .map((a) => ({ id: a.id, title: a.title, savingsMs: Math.round(a.details.overallSavingsMs) }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
  return {
    url,
    fetchedAt: new Date().toISOString(),
    scores: {
      performance: Math.round((cat.performance?.score ?? 0) * 100),
      accessibility: Math.round((cat.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cat['best-practices']?.score ?? 0) * 100),
      seo: Math.round((cat.seo?.score ?? 0) * 100),
    },
    metrics: {
      lcp: Math.round(audit('largest-contentful-paint')),
      tbt: Math.round(audit('total-blocking-time')),
      cls: Number(audit('cumulative-layout-shift').toFixed(3)),
      fcp: Math.round(audit('first-contentful-paint')),
      si: Math.round(audit('speed-index')),
    },
    opportunities,
  }
}

async function main() {
  if (!skipBuild) {
    await run('./node_modules/.bin/next', ['build'])
  }

  const port = Number(wantedPort) || (await getFreePort())
  const url = `http://localhost:${port}/`
  const server = spawn('./node_modules/.bin/next', ['start', '-p', String(port)], { stdio: 'inherit' })

  let chrome
  try {
    await waitForServer(url)
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] })

    const reports = []
    for (let i = 0; i < runs; i++) {
      const result = await lighthouse(
        url,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        { extends: 'lighthouse:default', settings: { onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] } },
      )
      reports.push(toReport(result.lhr, url))
    }

    // Performance 점수 기준 median run 채택
    reports.sort((a, b) => a.scores.performance - b.scores.performance)
    const median = reports[Math.floor(reports.length / 2)]

    const json = JSON.stringify(median, null, 2)
    if (outPath) await writeFile(outPath, json)
    process.stdout.write(json + '\n')
  } finally {
    if (chrome) await chrome.kill()
    server.kill('SIGTERM')
    // next start가 SIGTERM 무시할 경우 대비
    setTimeout(() => server.kill('SIGKILL'), 3000).unref()
    await Promise.race([once(server, 'exit'), new Promise((r) => setTimeout(r, 4000))])
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: 실행하여 측정값이 나오는지 확인**

Run: `npm run lh:measure -- --out /tmp/lh-baseline.json`
Expected: `next build` 후 서버 기동 → Lighthouse 3회 → `scores.performance` 등 4개 점수가 담긴 JSON이 출력되고 `/tmp/lh-baseline.json` 생성. 프로세스가 매달리지 않고 정상 종료.

- [ ] **Step 3: Commit**

```bash
git add scripts/lighthouse/measure.mjs
git commit -m "feat(perf): 랜딩 프로덕션 빌드 Lighthouse 측정 하네스 추가"
```

---

### Task 6: 오케스트레이션 스킬 `lighthouse-loop`

**Files:**
- Create: `.claude/skills/lighthouse-loop/SKILL.md`

**Interfaces:**
- Consumes: `npm run lh:measure`(Task 4/5), `src/lib/perf/decision.ts`(Task 1-3), Agent 서브에이전트.
- Produces: 세션이 따라 실행하는 루프 절차 문서. iteration별 산출물은 `docs/perf/lighthouse-loop-YYYY-MM-DD.md` Journal.

- [ ] **Step 1: 스킬 작성**

```markdown
---
name: lighthouse-loop
description: 랜딩(/) 페이지를 Lighthouse로 측정하고 서브에이전트가 성능 최적화를 1건씩 자율 적용하며 목표(Performance≥95)·정체·상한까지 반복하는 autoresearch 루프. "라이트하우스 루프", "성능 최적화 루프 돌려줘", "성능 자동 최적화" 요청 시 사용.
---

# Lighthouse Autoresearch Loop

랜딩 `/` 성능을 자율 반복 최적화한다. 결정적 측정·판정은 도구가, 최적화는 서브에이전트가 맡는다.

## 준비
- clean git 상태 확인(`git status`). 미커밋 변경이 있으면 사용자에게 먼저 정리 요청.
- Journal 파일 생성: `docs/perf/lighthouse-loop-<오늘날짜>.md` (헤더 + baseline 섹션).

## Baseline
1. `npm run lh:measure -- --out /tmp/lh-<n>.json` 실행(첫 회 n=0).
2. 4개 카테고리 점수·metrics를 Journal에 baseline으로 기록.
3. `shouldStop([baseline])` 확인 — 이미 target이면 종료.

## 각 iteration (n = 1,2,…)
1. **최적화 dispatch**: general-purpose Agent 서브에이전트에게:
   - 최신 리포트 JSON(점수·opportunities·metrics)과 CLAUDE.md 아키텍처 규칙 요약 전달.
   - 지시: "가장 임팩트 큰 성능 최적화 **딱 1건만** 구현하라(예: next/image 전환, dynamic import, 폰트 preload/display swap, next.config 최적화). `npm run build`와 `npm run test`가 통과해야 한다. 변경 파일 목록과 근거를 보고하라. 여러 최적화를 섞지 마라."
2. **빌드·테스트 게이트**: 서브에이전트 보고와 무관하게 직접 `npm run build`·`npm run test` 확인. 실패 시 → revert(아래).
3. **재측정**: `npm run lh:measure -- --skip-build --out /tmp/lh-<n>.json`.
   (서브에이전트가 이미 build 했으므로 `--skip-build` 사용. 단 소스 변경 반영 위해 재빌드가 필요하면 build 포함.)
4. **판정**: `compareScores(prev, curr)` + `isRegression(prev, curr)`를 `src/lib/perf/decision.ts` 로직으로 계산(작은 임시 스크립트나 `node -e`로 호출).
5. **keep / revert**:
   - improved && !regression && 빌드·테스트 통과 → `git add -A && git commit -m "perf: <요약> (perf +Δ)"`. curr을 prev로 승격.
   - 아니면 → `git checkout . && git clean -fd`로 원복. 정체 카운트 +1.
6. **Journal 기록**: iteration 번호, before→after 4점수, perfDelta, 변경 요약, keep/revert, 사유.
7. **종료 판정**: `shouldStop(history)` — target/plateau/hardCap이면 루프 종료.

## 종료 시
- Journal에 baseline→final 요약표와 총 개선폭, 종료 사유 기록.
- 사용자에게 최종 점수와 적용된 최적화 목록 보고.

## 에러 처리
- Lighthouse 실행 실패 → 1회 재시도, 재실패 시 루프 중단하고 사용자에게 보고.
- 매 iteration이 git 커밋 경계이므로 어느 지점으로든 롤백 가능.
```

- [ ] **Step 2: 스킬 로딩 확인**

Run: `test -f .claude/skills/lighthouse-loop/SKILL.md && head -3 .claude/skills/lighthouse-loop/SKILL.md`
Expected: frontmatter `name: lighthouse-loop`가 보임.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/lighthouse-loop/SKILL.md
git commit -m "feat(perf): lighthouse-loop 오케스트레이션 스킬 추가"
```

---

## 실행 후: 제품 검증 (첫 루프 가동)

Task 1-6 완료 후, 실제 제품에 루프를 1회 이상 가동해 검증한다.

- [ ] `lighthouse-loop` 스킬을 실행해 baseline 측정.
- [ ] 최소 1 iteration을 돌려 서브에이전트 최적화 → 재측정 → keep/revert가 동작하는지 확인.
- [ ] Journal(`docs/perf/lighthouse-loop-<날짜>.md`)에 결과가 남는지 확인.
- [ ] 사용자에게 baseline 점수와 첫 최적화 결과 보고.

## Self-Review 결과

- **Spec 커버리지**: 측정 하네스(Task 5), 결정 로직 3함수(Task 1-3), 스킬 오케스트레이션(Task 6), 의존성·스크립트(Task 4), Journal(Task 6 스킬 내), 종료 조건(Task 3), 에러 처리(Task 5 finally + 스킬) 모두 매핑됨. 제품 검증(스펙의 목적) = 실행 후 섹션.
- **Placeholder 스캔**: TODO/TBD 없음. 모든 코드 스텝에 실제 코드 포함.
- **타입 일관성**: `LighthouseReport`/`CategoryScores`(Task 1) → `measure.mjs` 출력(Task 5)·`compareScores`/`isRegression` 입력 일치. `IterationRecord`(Task 3) → 스킬의 history 일치. `bestPractices` 카멜키로 통일(lighthouse의 `best-practices`는 `measure.mjs`에서 변환).
