# PR 자동 리뷰 — 사전 설정 (봇이 못 하는 것)

워크플로우(`.github/workflows/pr-review.yml`)를 푸시하기 전에 아래 작업을 완료하라.  
순서대로 하지 않으면 `gate` 잡이 실패해도 머지가 막히지 않는다.

---

## 1. ANTHROPIC_API_KEY 시크릿 등록

Settings → Secrets and variables → Actions → **New repository secret**

| 이름 | 값 |
|------|-----|
| `ANTHROPIC_API_KEY` | Anthropic Console에서 발급한 API 키 |

> **비용 주의**: PR이 열리거나 새 커밋이 푸시될 때마다 LLM 리뷰가 실행된다.  
> 토큰 과금이 발생하므로, 활성 브랜치가 많을 경우 Claude API 사용량을 모니터링하라.

---

## 2. Auto-merge 허용

Settings → General → Pull Requests 섹션 →  
**"Allow auto-merge"** 체크박스를 활성화한다.

이게 없으면 `gate` 잡에서 `gh pr merge --auto --squash` 호출이 실패한다.

---

## 3. 브랜치 보호 규칙 설정 (main)

Settings → Branches → **Add branch protection rule** (또는 기존 main 규칙 편집)

다음 항목을 활성화한다:

- [x] **Require status checks to pass before merging**
  - **Required status checks**에 아래 두 잡을 검색해 추가:
    - `checks`
    - `gate`
  - (워크플로우를 한 번이라도 실행해야 검색 목록에 나타난다)
- [x] **Require branches to be up to date before merging** (권장)

> **핵심**: `gate` 잡이 required check가 돼야 `exit 1`이 실제로 머지 버튼을 비활성화한다.  
> 이 설정 없이는 `gate` 실패가 있어도 머지가 가능하다.

---

## 4. 봇 승인의 한계 이해

`GITHUB_TOKEN`(Actions 봇)이 제출하는 approve는 **사람 N명 승인 요구**를 충족하지 않는다.  
실제 차단력은 **`gate` required check의 통과/실패**에서 나온다.  
리뷰 이벤트(approve/request-changes)는 PR 상태 표시와 알림용이다.

---

## 5. Fork PR 제한

보안상 fork에서 온 PR에는 `secrets.ANTHROPIC_API_KEY`가 주입되지 않는다.  
→ `llm-review` 잡이 실패 → fail-closed(fallback Blocked verdict) → `gate` 잡이 blocked=true → 머지 차단.

이 워크플로우는 **같은 리포의 브랜치 PR**을 전제로 한다.  
외부 기여자 fork PR이 필요하다면 별도 설정이 필요하다.

---

## 6. 워크플로우 첫 실행 확인 순서

1. 이 런북의 1~3번을 완료한다.
2. 테스트 브랜치를 만들고 작은 변경(nit만 유도)을 커밋해 PR을 연다.
3. Actions 탭에서 `checks → llm-review → gate` 순으로 3잡이 실행되는지 확인한다.
4. `gate` 잡 로그에서 `[review-gate]` 라인과 verdict를 확인한다.
5. 브랜치 보호 필수 체크에 `checks`·`gate`가 등록되면 PR 하단 "Merge" 버튼 상태로 차단력을 검증한다.

---

## 빠른 체크리스트

- [ ] `ANTHROPIC_API_KEY` 시크릿 등록
- [ ] Auto-merge 허용 (Settings → General → Pull Requests)
- [ ] main 브랜치 보호: `checks` + `gate` required status checks 등록
- [ ] 워크플로우 첫 실행 후 Actions 탭에서 3잡 순서 확인
