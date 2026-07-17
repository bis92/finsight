---
name: create-pr
description: 현재 브랜치를 origin에 push하고 GitHub Pull Request를 생성한다. gh CLI가 있으면 gh pr create로 자동 생성하고, 없으면 push 후 GitHub의 PR 생성 URL로 폴백한다. "PR 만들어줘", "풀리퀘스트 생성", "메인으로 PR", "이 브랜치 올려줘/push해줘", "PR 열어줘" 같은 요청이나, 기능 브랜치 작업을 마치고 리뷰에 올릴 때 반드시 이 스킬을 사용하라. 단, 브랜치를 origin에 단순 push만 하고 PR은 원치 않는 경우엔 트리거하지 마라.
---

# create-pr — 브랜치 push + PR 생성 (gh 폴백 내장)

## 왜 이 스킬이 필요한가

이 머신엔 `gh` CLI가 설치돼 있지 않을 수 있다. `gh pr create`가 실패하면 PR 생성이 멈춘다.
이 스킬은 **gh 유무를 먼저 확인**하고, 없으면 GitHub이 push 응답으로 주는 PR 생성 URL로 폴백해
어떤 환경에서도 PR까지 이어지게 한다. 매번 수동으로 폴백을 재현하지 않기 위해 스킬로 고정한다.

## 절차

### 1. 사전 확인 (행동 전에)

되돌리기 어려운 push/PR 전에 상태를 먼저 잡는다. 순서대로 확인하라:

```bash
git fetch origin -q
git branch --show-current                      # 현재 브랜치. main이면 중단하고 사용자에게 확인
git status --short                              # uncommitted 변경 유무
git log --oneline @{u}..HEAD 2>/dev/null || echo "no-upstream"   # 아직 push 안 된 커밋
```

- 현재 브랜치가 `main`/`master`이면 **멈추고** 어느 브랜치를 PR할지 확인한다. 보호 브랜치에서 바로 PR을 만들지 않는다.
- uncommitted 변경이 있으면 사용자에게 커밋할지 물어본다. 임의로 커밋하지 마라.
- **동시성 주의:** 여러 워크트리/백그라운드 에이전트가 도는 리포에선 브랜치 tip이 방금 바뀌었을 수 있다. `git fetch` 후 상태를 신뢰하라.

### 2. push

```bash
git push -u origin "$(git branch --show-current)"
```

`-u`로 upstream을 설정한다. push 출력에 나오는 `Create a pull request ... visiting: <URL>` 줄을 보관한다 (3-b 폴백에서 쓴다).

### 3. PR 생성 — gh 유무로 분기

```bash
command -v gh >/dev/null 2>&1 && echo "GH_OK" || echo "GH_MISSING"
```

**3-a. gh 있음 (`GH_OK`):**

```bash
gh pr create --base main --head "$(git branch --show-current)" \
  --title "<타입(scope): 제목>" \
  --body "<본문>"
```

- 제목은 conventional commits 형식(`feat:`, `fix:`, `docs:`, `chore:` …)을 따른다 (프로젝트 규약).
- 본문에는 개요 · 주요 변경 · 검증 방법을 담는다. 미완/블로킹 사항이 있으면 `## ⚠️ 미완/블로킹` 섹션으로 명시한다.

**3-b. gh 없음 (`GH_MISSING`):**

2단계 push에서 얻은 URL을 사용자에게 제시한다. 형식:

```
https://github.com/<owner>/<repo>/pull/new/<branch>
```

- 이 URL을 열면 base←compare가 채워진 PR 생성 화면이 뜬다.
- 복붙할 **제목·본문**을 함께 제공해, 사용자가 클릭 몇 번으로 끝내게 한다.
- 설치를 원하면 안내한다: `brew install gh && gh auth login` → 이후엔 3-a 경로로 자동 생성된다.

### 4. 결과 보고

무엇을 했는지 사실대로 보고한다: push된 브랜치, upstream 설정 여부, 생성된 PR 링크(또는 폴백 URL). 미완/블로킹이 있으면 머지 전 필요한 조건을 함께 알린다.

## 금지사항

- **보호 브랜치(main/master)에서 바로 PR을 만들지 마라.** 이유: 워크플로우상 기능 브랜치→PR→머지이며, 실수 머지는 되돌리기 어렵다.
- **uncommitted 변경을 임의로 커밋하지 마라.** 무엇을 포함할지 사용자에게 확인한다.
- **PR 본문에 내부 예외·시크릿·서드파티 원문을 넣지 마라** (프로젝트 CLAUDE.md 보안 규칙과 동일).
