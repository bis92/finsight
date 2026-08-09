# 자동 PR 리뷰 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR이 열리면 결정적 검사 → LLM `review-code` 리뷰 → 심각도 기반 머지 게이팅이 자동으로 도는 CI 파이프라인과, 커밋 단계의 싼 결정적 pre-commit 훅을 만든다.

**Architecture:** 로컬은 husky+lint-staged로 staged ESLint+`tsc --noEmit`(LLM 없음). CI(`pr-review.yml`)는 잡 3개 — `checks`(lint·type·test, required) → `llm-review`(공식 claude-code-action이 review-code를 CI 모드로 실행, `review-verdict.json` 산출+PR 코멘트) → `gate`(판정 JSON을 `scripts/review-gate.mjs`로 읽어 approve/request-changes/auto-merge + required-check exit code). 실제 머지 차단력은 봇 리뷰가 아니라 gate 잡의 exit code(=required status check)에서 나온다.

**Tech Stack:** GitHub Actions, husky v9, lint-staged, Node 22 ESM 스크립트, vitest, `anthropics/claude-code-action`, `gh` CLI.

## Global Constraints

- 작업 브랜치: 현재 `main`. 구현은 **`feat/auto-pr-review` 브랜치**에서 한다(main 직접 커밋 금지).
- Node 22 / npm 10. CI는 `npm ci`.
- 검사 커맨드(정확히): lint=`npm run lint`(next lint), 타입=`npx tsc --noEmit`, 테스트=`npm run test`(vitest run).
- 포맷터(prettier) 도입 금지 — 이 리포에 없음(YAGNI).
- 커밋 메시지: conventional commits(feat/fix/chore/docs).
- **게이팅 정책(불변):** critical+major ≥1 → REQUEST_CHANGES + 머지 차단(exit 1) + 승인 금지 / minor까지(crit·major 0) → APPROVE, 자동 머지 안 함 / nit만·무결점 → APPROVE + 자동 머지.
- **fail-closed:** `review-verdict.json`이 없거나 파싱 실패면 머지 차단(REQUEST_CHANGES, blocked=true).
- gate 판정의 단일 진실 원천은 `counts`(critical/major/minor/nit)다. 스킬이 함께 쓰는 `verdict`/`automerge` 필드는 사람용 표기일 뿐, gate는 counts로 재계산한다.

---

### Task 1: pre-commit 훅 (husky + lint-staged)

**Files:**
- Modify: `package.json` (devDependencies, `scripts.prepare`, `lint-staged` 블록)
- Create: `.husky/pre-commit`

**Interfaces:**
- Produces: 커밋 시 `npx lint-staged && npx tsc --noEmit` 자동 실행. 다른 Task와 코드 의존 없음.

- [ ] **Step 1: 작업 브랜치 생성**

```bash
git fetch origin -q
git checkout -b feat/auto-pr-review
```

- [ ] **Step 2: 의존성 설치**

```bash
npm install -D husky lint-staged
```

- [ ] **Step 3: husky 초기화 + prepare 스크립트**

```bash
npx husky init
```
`npx husky init`은 `package.json`에 `"prepare": "husky"`를 추가하고 `.husky/pre-commit`(기본 `npm test`)를 만든다. `scripts`에 `prepare`가 생겼는지 확인한다. 없으면 수동 추가:
```json
"prepare": "husky"
```

- [ ] **Step 4: `.husky/pre-commit` 내용 교체**

`.husky/pre-commit` 전체를 아래로 덮어쓴다(husky v9는 shebang·`. "$(dirname ...)"` 불필요):
```sh
npx lint-staged && npx tsc --noEmit
```

- [ ] **Step 5: `package.json`에 lint-staged 설정 추가**

`package.json` 최상위에 추가:
```json
"lint-staged": {
  "*.{ts,tsx}": "eslint --fix"
}
```
(ESLint는 staged 파일만. 타입체크는 파일 단위로 못 쪼개므로 pre-commit 훅의 두 번째 명령 `tsc --noEmit`으로 프로젝트 전체 1회 실행.)

- [ ] **Step 6: 훅이 실제로 막는지 검증**

lint 위반 파일을 임시로 만들어 커밋 시도:
```bash
printf 'const x=1\nexport const y = ()=>{let z;return 1}\n' > src/__hook_probe.ts
git add src/__hook_probe.ts
git commit -m "test: hook probe"   # 실패해야 정상 (eslint/tsc가 막음)
```
Expected: 커밋이 **중단**된다(비영). 확인 후 정리:
```bash
git reset -q HEAD src/__hook_probe.ts && rm src/__hook_probe.ts
```

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json .husky/pre-commit
git commit -m "chore: pre-commit 훅(lint-staged eslint + tsc --noEmit) 추가"
```

---

### Task 2: review-code 스킬에 CI 모드 출력 계약 추가

**Files:**
- Modify: `.claude/skills/review-code/SKILL.md` (새 섹션 추가)

**Interfaces:**
- Produces: CI 모드로 실행되면 스킬이 워크스페이스 루트에 `review-verdict.json`을 쓴다. 스키마:
  ```json
  { "verdict": "Blocked"|"Approve",
    "counts": {"critical":0,"major":0,"minor":0,"nit":0},
    "automerge": true|false }
  ```
  Task 3의 `review-gate.mjs`가 `counts`를 소비한다.

- [ ] **Step 1: SKILL.md에 CI 모드 섹션 추가**

`.claude/skills/review-code/SKILL.md`의 "### 3. 취합·리포트" 섹션 **끝**에 아래를 추가:

````markdown
### 4. CI 모드 (headless 실행 시에만)

프롬프트에 "CI 모드"가 명시되면, 사람용 2층 출력에 더해 **워크스페이스 루트에 `review-verdict.json`을 쓴다**(GitHub Action의 gate가 읽는다):

```json
{
  "verdict": "Blocked",
  "counts": { "critical": 0, "major": 0, "minor": 1, "nit": 3 },
  "automerge": false
}
```

- `counts`: 4개 차원 발견을 심각도별로 합산한 실제 건수(단일 진실 원천).
- `verdict`: `critical + major ≥ 1`이면 `"Blocked"`, 아니면 `"Approve"`.
- `automerge`: `critical + major + minor == 0`(nit만/무결점)일 때만 `true`, 그 외 `false`.
- 이 파일을 반드시 마지막에 써라. 코멘트·요약은 사람용이고, gate는 이 JSON만 신뢰한다.
````

(주: 기존 "차원 레지스트리" 섹션과 이후 "## 금지사항"의 위치는 유지. 새 "### 4."는 취합 섹션 바로 뒤, 금지사항 앞에 들어간다.)

- [ ] **Step 2: 내용 확인**

```bash
grep -n "CI 모드\|review-verdict.json\|automerge" .claude/skills/review-code/SKILL.md
```
Expected: 새 섹션의 라인들이 잡힌다.

- [ ] **Step 3: 커밋**

```bash
git add .claude/skills/review-code/SKILL.md
git commit -m "feat(review-code): CI 모드 review-verdict.json 출력 계약 추가"
```

---

### Task 3: 게이트 판정 스크립트 + 테스트 (TDD)

**Files:**
- Create: `scripts/review-gate.mjs`
- Test: `scripts/review-gate.test.mjs`

**Interfaces:**
- Produces: `export function decideGate(counts) -> { event: 'APPROVE'|'REQUEST_CHANGES', automerge: boolean, blocked: boolean }`.
  - CLI `node scripts/review-gate.mjs <verdict.json>`는 파일을 읽어 `decideGate(json.counts)`를 계산하고, `$GITHUB_OUTPUT`에 `event`/`automerge`/`blocked`를 쓴다(항상 exit 0 — 강제는 워크플로우가 함). 읽기·파싱 실패 시 fail-closed(`REQUEST_CHANGES`/`automerge=false`/`blocked=true`).
- Consumes: Task 2의 `review-verdict.json` `counts`. Task 4가 CLI 출력을 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `scripts/review-gate.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { decideGate } from './review-gate.mjs'

describe('decideGate', () => {
  it('critical 있으면 차단 + REQUEST_CHANGES', () => {
    expect(decideGate({ critical: 1, major: 0, minor: 0, nit: 0 })).toEqual({
      event: 'REQUEST_CHANGES', automerge: false, blocked: true,
    })
  })
  it('major 있으면 차단(다른 심각도 무관)', () => {
    expect(decideGate({ critical: 0, major: 2, minor: 3, nit: 5 })).toEqual({
      event: 'REQUEST_CHANGES', automerge: false, blocked: true,
    })
  })
  it('minor까지면 APPROVE·자동머지 안 함', () => {
    expect(decideGate({ critical: 0, major: 0, minor: 1, nit: 4 })).toEqual({
      event: 'APPROVE', automerge: false, blocked: false,
    })
  })
  it('nit만이면 APPROVE + 자동머지', () => {
    expect(decideGate({ critical: 0, major: 0, minor: 0, nit: 3 })).toEqual({
      event: 'APPROVE', automerge: true, blocked: false,
    })
  })
  it('무결점이면 APPROVE + 자동머지', () => {
    expect(decideGate({ critical: 0, major: 0, minor: 0, nit: 0 })).toEqual({
      event: 'APPROVE', automerge: true, blocked: false,
    })
  })
  it('counts 필드 누락은 0으로 취급', () => {
    expect(decideGate({})).toEqual({
      event: 'APPROVE', automerge: true, blocked: false,
    })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run scripts/review-gate.test.mjs`
Expected: FAIL — `Failed to load .../review-gate.mjs` 또는 `decideGate is not a function`.

- [ ] **Step 3: 최소 구현 작성**

Create `scripts/review-gate.mjs`:
```js
// review-code CI 게이트 판정. counts(단일 진실 원천)로 머지 정책을 계산한다.
export function decideGate(counts = {}) {
  const critical = Number(counts.critical) || 0
  const major = Number(counts.major) || 0
  const minor = Number(counts.minor) || 0
  if (critical + major >= 1) {
    return { event: 'REQUEST_CHANGES', automerge: false, blocked: true }
  }
  if (minor >= 1) {
    return { event: 'APPROVE', automerge: false, blocked: false }
  }
  return { event: 'APPROVE', automerge: true, blocked: false }
}

// CLI: node scripts/review-gate.mjs <verdict.json>
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, appendFileSync } = await import('node:fs')
  const path = process.argv[2] || 'review-verdict.json'
  let decision
  try {
    const verdict = JSON.parse(readFileSync(path, 'utf8'))
    decision = decideGate(verdict.counts)
  } catch (err) {
    // fail-closed: 판정 없으면 머지 차단
    console.error(`[review-gate] verdict 읽기 실패 → fail-closed: ${err.message}`)
    decision = { event: 'REQUEST_CHANGES', automerge: false, blocked: true }
  }
  console.log(`[review-gate] ${JSON.stringify(decision)}`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `event=${decision.event}\nautomerge=${decision.automerge}\nblocked=${decision.blocked}\n`,
    )
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run scripts/review-gate.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: CLI fail-closed 수동 검증**

```bash
node scripts/review-gate.mjs /tmp/does-not-exist.json
```
Expected: `[review-gate] {"event":"REQUEST_CHANGES","automerge":false,"blocked":true}` 출력, exit 0.
정상 입력도 확인:
```bash
echo '{"counts":{"critical":0,"major":0,"minor":0,"nit":2}}' > /tmp/v.json
node scripts/review-gate.mjs /tmp/v.json   # automerge:true 나와야 함
```

- [ ] **Step 6: 커밋**

```bash
git add scripts/review-gate.mjs scripts/review-gate.test.mjs
git commit -m "feat(ci): review-code 게이트 판정 스크립트(decideGate) + 테스트"
```

---

### Task 4: PR 리뷰 GitHub Actions 워크플로우

**Files:**
- Create: `.github/workflows/pr-review.yml`
- Create: `.github/PR_REVIEW_SETUP.md` (사용자 사전작업 런북)

**Interfaces:**
- Consumes: `secrets.ANTHROPIC_API_KEY`, `scripts/review-gate.mjs`(Task 3), review-code CI 모드(Task 2).
- Produces: main 대상 PR에서 `checks`→`llm-review`→`gate` 3잡. `gate`가 required check로서 머지 차단력을 갖는다.

- [ ] **Step 1: claude-code-action 최신 입력 이름 확인**

이 액션의 입력 키(예: `anthropic_api_key`, `prompt`, 태그 `@v1`)는 버전마다 다르다. 구현 시 반드시 README로 대조하라:
```bash
# WebFetch 또는 브라우저로
# https://github.com/anthropics/claude-code-action  (README의 inputs 표)
```
아래 YAML의 `uses:` 태그와 `with:` 키를 README 현행값에 맞춘다(추정 금지).

- [ ] **Step 2: 워크플로우 파일 작성**

Create `.github/workflows/pr-review.yml`:
```yaml
name: PR Review

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize]

permissions:
  contents: write        # auto-merge 활성화
  pull-requests: write   # 리뷰(approve/request-changes) 제출

concurrency:
  group: pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test

  llm-review:
    needs: checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # base…head diff 위해 전체 히스토리
      # ⚠️ Step 1에서 확인한 현행 입력 키/태그로 맞출 것
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            review-code 스킬을 CI 모드로 실행하라.
            BASE=${{ github.event.pull_request.base.sha }}
            HEAD=${{ github.event.pull_request.head.sha }}
            차원별 서브에이전트를 병렬로 띄워 리뷰하고, PR에 요약·인라인 코멘트를 남긴 뒤,
            워크스페이스 루트에 review-verdict.json 을 계약 스키마대로 써라.
      - name: verdict 보장 (fail-closed)
        if: always()
        run: |
          test -f review-verdict.json || \
            echo '{"verdict":"Blocked","counts":{"critical":1,"major":0,"minor":0,"nit":0},"automerge":false}' > review-verdict.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: review-verdict
          path: review-verdict.json

  gate:
    needs: llm-review
    if: always()          # llm-review 실패해도 gate가 돌아 fail-closed 판정
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/download-artifact@v4
        with:
          name: review-verdict
      - id: gate
        run: node scripts/review-gate.mjs review-verdict.json
      - name: 리뷰 제출
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          if [ "${{ steps.gate.outputs.event }}" = "REQUEST_CHANGES" ]; then
            gh pr review "$PR" --request-changes --body "🚫 review-code: major/critical 발견 — 머지 차단"
          else
            gh pr review "$PR" --approve --body "✅ review-code 자동 승인"
          fi
      - name: 자동 머지 활성화
        if: steps.gate.outputs.automerge == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh pr merge ${{ github.event.pull_request.number }} --auto --squash
      - name: 게이트 강제 (fail-closed)
        if: steps.gate.outputs.blocked == 'true'
        run: |
          echo "major/critical 존재 → required check 실패로 머지 차단"
          exit 1
```

- [ ] **Step 3: 사용자 사전작업 런북 작성**

Create `.github/PR_REVIEW_SETUP.md`:
```markdown
# PR 자동 리뷰 — 사전 설정 (봇이 못 하는 것)

1. **시크릿**: Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY` 추가. (매 PR 토큰 과금)
2. **auto-merge 허용**: Settings → General → Pull Requests → "Allow auto-merge" 체크.
3. **브랜치 보호(main)**: Settings → Branches → main 규칙:
   - Require status checks to pass → `checks`, `gate` 를 required 로 지정.
   - (권장) Require branches to be up to date before merging.
   - 이게 있어야 gate의 exit 1이 실제로 머지를 막는다.
4. **주의(봇 승인 한계)**: Actions 봇(GITHUB_TOKEN)의 approve는 "사람 N명 승인" 요구를 만족시키지 않는다.
   실제 차단력은 `gate` required check의 통과/실패에서 나온다. 리뷰 이벤트는 신호용.
5. **fork PR**: 기본 보안상 시크릿이 fork PR에 주입되지 않아 llm-review가 실패→fail-closed(차단)된다.
   같은 리포 브랜치 PR을 전제로 한다.
```

- [ ] **Step 4: YAML 문법 sanity 체크**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pr-review.yml')); print('YAML OK')"
```
Expected: `YAML OK`. (python yaml 없으면 스킵하고 GitHub Actions 탭에서 문법 오류 없는지 확인.)

- [ ] **Step 5: 커밋 + push + PR로 실동작 검증**

```bash
git add .github/workflows/pr-review.yml .github/PR_REVIEW_SETUP.md
git commit -m "feat(ci): PR 자동 리뷰 워크플로우(checks→llm-review→gate) 추가"
```
그다음 사전작업(런북) 완료 후, **작은 테스트 PR**로 3잡이 순서대로 도는지 확인한다. 로컬 유닛 검증은 Task 3까지로 끝나며, 잡 오케스트레이션·gh 연동은 실제 PR에서만 검증된다(아래 Verification).

---

## Verification (전체 e2e — GitHub에서)

1. **pre-commit**: lint/type 에러 파일 stage 후 커밋 → 중단(Task 1 Step 6).
2. **gate 단위**: `npx vitest run scripts/review-gate.test.mjs` PASS + CLI fail-closed(Task 3).
3. **게이팅 매트릭스**(테스트 PR 3개):
   - nit만 유도 → `gate`가 APPROVE + `gh pr merge --auto` 발동, `checks` 통과 시 자동 머지.
   - minor 포함 → APPROVE, 자동 머지 안 됨.
   - major/critical 유도(예: 클라 컴포넌트에서 시크릿 참조 스텁) → REQUEST_CHANGES + `gate` fail + 머지 버튼 비활성.
4. **fail-closed**: `ANTHROPIC_API_KEY` 비우고 PR → `llm-review` 실패 → fallback verdict → `gate` blocked=true → 머지 차단.

## Self-Review 결과 (스펙 대비)

- pre-commit(lint-staged+tsc) → Task 1 ✓
- LLM 리뷰 PR 전용 / claude-code-action / 모든 PR → Task 4 ✓
- CI 모드 verdict 계약 → Task 2 ✓
- 게이팅 3단계 + fail-closed + required-check 강제 → Task 3(decideGate) + Task 4(gate 잡) ✓
- 사용자 사전작업(시크릿·브랜치 보호·auto-merge) → Task 4 Step 3 런북 ✓
- Out of scope(fork PR·pre-push·10차원·큰 diff) → 계획에서 제외 유지 ✓
