# 자동 PR 리뷰 파이프라인 — 설계 스펙

작성일: 2026-08-09

## Context

`review-code` 스킬(`.claude/skills/review-code/`)은 지금 **인터랙티브 Claude Code 세션에서 사람이 호출**해야만 동작한다(내가 Agent 툴로 차원별 서브에이전트 4개를 병렬로 띄우는 방식). PR을 열 때마다 사람이 수동으로 돌려야 하므로 잘 안 돌게 된다.

목표: **PR이 열리면 자동으로 리뷰가 돌고, 심각도에 따라 머지를 게이팅**하는 파이프라인을 만든다. 더불어 커밋 단계에서 싼 결정적 검사를 걸어 명백한 실수를 조기에 잡는다.

현 인프라: `.github/` 없음(CI 전무), husky·git hook 없음, `claude` CLI 설치됨(`--allow-dangerously-skip-permissions` alias).

## 확정된 결정

1. **역할 분리** — pre-commit = 싸고 결정적인 검사(LLM 없음). LLM `review-code` = PR에서 GitHub Action으로만.
2. **pre-commit 범위** — lint-staged로 staged 파일 ESLint + 프로젝트 `tsc --noEmit`. test·smoke는 넣지 않음(무거움).
3. **LLM 실행 방식** — 공식 `anthropics/claude-code-action`.
4. **트리거 범위** — main 대상 모든 PR(`opened`·`synchronize`).
5. **머지 게이팅 정책 (핵심):**

   | 발견 중 최고 심각도 | PR 리뷰 이벤트 | 자동 머지 | required check |
   |---|---|---|---|
   | 없음 / **nit만** | APPROVE | ✅ 허용 (`checks` 통과 시) | pass |
   | **minor**까지 (major·critical 0) | APPROVE | ❌ 사람이 머지 | pass |
   | **major·critical ≥1** | 🚫 REQUEST_CHANGES | ❌ 금지 | **fail (exit 1)** |

   > major·critical이 하나라도 있으면 머지도 승인도 절대 안 된다.

## 핵심 통찰 — 진짜 게이트는 status check다

GitHub에서 머지를 신뢰성 있게 막는 수단은 **봇의 REQUEST_CHANGES 리뷰가 아니라 required status check(통과/실패)** 다. 봇(GITHUB_TOKEN)이 제출한 리뷰는 브랜치 보호의 "사람 N명 승인" 규칙을 만족시키지 못하고, REQUEST_CHANGES도 하드 블록이 아니다.

따라서 **강제력은 게이트 잡의 exit code**로 구현한다. APPROVE/REQUEST_CHANGES 리뷰 이벤트는 사람에게 보이는 신호일 뿐, 실제 차단은 "required check가 fail" 이라는 사실로 이뤄진다. 이 설계가 성립하려면 `main` 브랜치 보호에서 해당 잡을 required로 지정해야 한다(사용자 사전작업).

## 아키텍처

### 구성 파일 (신규)

| 파일 | 역할 |
|---|---|
| `.husky/pre-commit` | `npx lint-staged` 실행 |
| `package.json`(수정) | `lint-staged` 설정 + `prepare: husky` + husky·lint-staged devDependency |
| `.github/workflows/pr-review.yml` | PR 트리거 CI 워크플로우(잡 3개) |
| `.claude/skills/review-code/SKILL.md`(수정) | CI 모드 출력 계약 추가 |

### pre-commit (로컬)

- husky v9: `.husky/pre-commit` → `npx lint-staged && npx tsc --noEmit`.
- lint-staged 설정(package.json):
  ```json
  "lint-staged": {
    "*.{ts,tsx}": "eslint --fix"
  }
  ```
  - ESLint는 staged 파일만(`eslint --fix`). 포맷터(prettier)는 이 리포에 없으므로 도입하지 않음(YAGNI).
  - `tsc --noEmit`은 파일 단위로 못 쪼개므로 lint-staged 밖에서 프로젝트 전체 1회 실행(pre-commit 훅 두 번째 명령).
  - 초 단위 유지. 어느 쪽이든 실패 시 커밋 중단.

### CI 워크플로우 `pr-review.yml` — 잡 3개

```
on: pull_request: { branches: [main], types: [opened, synchronize] }
```

1. **`checks`** (결정적, required)
   - `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm run test`.
   - 실패 시 여기서 머지 차단(가장 싼 게이트가 먼저).

2. **`llm-review`** (`needs: checks`)
   - `anthropics/claude-code-action` 사용, `ANTHROPIC_API_KEY` 시크릿 주입.
   - 프롬프트: "review-code 스킬을 CI 모드로 실행하라. BASE=PR base SHA, HEAD=PR head SHA." (스킬의 스코프 규칙을 PR base…head로 매핑.)
   - 산출물 2개: (a) PR에 요약·인라인 코멘트, (b) 워크스페이스에 **`review-verdict.json`**(머신리더블).

3. **`gate`** (`needs: llm-review`, required)
   - `review-verdict.json`을 읽어 분기(마크다운 파싱 금지):
     - `major+critical ≥ 1` → `gh pr review --request-changes` + **`exit 1`** (required check fail → 머지 차단).
     - `minor ≥ 1, major+critical = 0` → `gh pr review --approve` + `exit 0`.
     - `nit`만/무결점 → `gh pr review --approve` + `gh pr merge --auto --squash` + `exit 0`.
   - auto-merge는 `checks`·`gate`가 모두 통과해야 실제 머지되므로, "nit인데 test 깨짐"은 자동 머지되지 않음(자연 방어).

### 스킬 CI 모드 출력 계약 (SKILL.md에 추가)

기존 사람용 2층 출력은 유지하되, **CI 모드일 때 워크스페이스에 `review-verdict.json`을 추가로 쓴다**:

```json
{
  "verdict": "Blocked" | "Approve",
  "counts": { "critical": 0, "major": 0, "minor": 1, "nit": 3 },
  "automerge": true | false
}
```

- `verdict`: critical+major ≥1 → `"Blocked"`, 아니면 `"Approve"`.
- `automerge`: (critical+major+minor = 0) 즉 nit만/무결점일 때만 `true`.
- Job 3는 이 3필드만 신뢰한다. counts는 로그·코멘트 표기에만.

## 사용자 사전작업 (봇이 못 하는 것)

1. **`ANTHROPIC_API_KEY`** 리포 시크릿 등록(Settings → Secrets → Actions). 매 PR마다 토큰 과금됨.
2. **브랜치 보호(`main`)**: `checks`·`gate`를 **required status check**로 지정. auto-merge 기능 리포에서 활성화(Settings → General → Allow auto-merge).
3. (선택) `gh` 리뷰 제출/머지 위해 워크플로우 permission `pull-requests: write`, `contents: write` 부여 — YAML에 명시.

## 에러 처리·엣지케이스

- **LLM 잡 실패/타임아웃**: `llm-review`가 죽으면 `gate`는 `review-verdict.json` 부재 → **보수적으로 fail(exit 1)** 처리(리뷰 없이 머지 통과 금지).
- **API 키 없음/과금 실패**: `llm-review` 실패 → 위와 동일하게 머지 차단. 사람이 사유 확인.
- **PR이 fork에서 옴**: 시크릿 미주입될 수 있음(GitHub 기본 보안). MVP는 **같은 리포 브랜치 PR만** 가정. fork PR 대응은 로드맵.
- **큰 diff**: 서브에이전트 토큰 폭증. 스킬이 파일 목록 기반으로 각자 필요한 만큼만 뽑으므로 일부 완화. 상한 초과 시 로그로 경고(후속).

## 검증

1. **pre-commit**: 타입 에러 있는 `.ts`를 staged 후 `git commit` → 커밋이 막히는지. 정상 파일은 통과.
2. **워크플로우 문법**: `act` 또는 GitHub에서 테스트 PR로 3잡이 순서대로(`checks`→`llm-review`→`gate`) 도는지.
3. **게이팅 매트릭스**(테스트 PR 3개로):
   - nit만 유도한 PR → APPROVE + auto-merge 발동.
   - minor 포함 PR → APPROVE, 자동 머지 안 됨.
   - major/critical 유도 PR(예: 클라에서 시크릿 참조 스텁) → REQUEST_CHANGES + `gate` fail + 머지 버튼 비활성.
4. **fail-closed**: `ANTHROPIC_API_KEY`를 일부러 비워 `llm-review` 실패시킴 → `gate`가 fail 나 머지 차단되는지.

## Out of Scope (로드맵)

- fork PR 시크릿 처리.
- pre-push 훅(test·smoke)은 이번 범위 밖(원하면 후속).
- 10개 차원 전체 활성화(현재 MVP 4개 유지).
- 큰 diff 자동 청크·상한 정책.
