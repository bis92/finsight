# oncall CI 자동수정 파이프라인 설계

- 날짜: 2026-08-16
- 상태: 승인됨 (구현 착수)
- 호스트: GitHub (`bis92/finsight`), 기본 브랜치 `main`, npm + `package-lock.json`, Node 22

## 목적

사람이 시켜서가 아니라 **"기본 CI가 깨졌다"는 사실 자체를 트리거**로 삼아, 헤드리스 에이전트가
실패 잡 로그를 읽고 근본 원인을 분석해 **수정 브랜치 → PR**을 여는 사고 대응(oncall) 파이프라인.
출력은 **무조건 PR**이며 **자동 머지는 없다(사람 게이트)**.

## 결정 사항 (브레인스토밍 확정)

1. 헤드리스 에이전트 = 공식 `anthropics/claude-code-action` (ANTHROPIC_API_KEY 시크릿 사용).
2. 자동수정 트리거 범위 = **main 병합 후 실패만** (`push`→`main` CI 실패). PR CI 실패는 대상 아님.
3. 기본 CI = `lint` + `build` + `test` (smoke 제외 — 서버 기동/env 의존 큼).

## 구성 요소

### 1) `.github/workflows/ci.yml` — 기본 CI (신호원)

- **트리거**: `pull_request`(→main) + `push`(→main).
- **잡 `ci`**: checkout → `setup-node@v4` (Node 22, npm 캐시) → `npm ci`
  → `npm run lint` → `npm run test` → `npm run build`.
  - `build` 스텝에 placeholder `NEXT_PUBLIC_*` env 주입 (env 부재로 인한 오탐 방지).
    앱 코드는 `!` 비-null 단언으로 env를 읽고 모듈 로드시 throw하지 않으므로 placeholder로 충분.
- **권한**: `contents: read`.
- **동시성**: `concurrency` 그룹으로 같은 ref의 이전 run 취소.
- 워크플로 `name: CI` — autofix가 이 이름을 구독한다.

### 2) `.github/workflows/ci-autofix.yml` — 실패 시에만 깨어나는 후속 잡

- **트리거**: `workflow_run` (`workflows: ["CI"]`, `types: [completed]`).
  - 추가로 `workflow_dispatch`(input `run_id`) — 시크릿 설정 후 수동 검증용 테스트 시임.
- **가드 `if:` (모두 AND) — 사고 범위 + 무한루프 차단**:
  - `github.event.workflow_run.conclusion == 'failure'`
  - `github.event.workflow_run.head_branch == 'main'`
  - `github.event.workflow_run.event == 'push'` → main 병합 후 사고만
  - `github.event.workflow_run.head_repository.full_name == github.repository` → **포크 트리거 skip**
  - actor가 봇 아님 (`github-actions[bot]`·`*[bot]` skip) → 봇 트리거 skip
  - **구조적 루프 불가**: 수정 PR은 `oncall/ci-fix-*` 브랜치로 열리므로 head_branch가 절대 `main`이
    아니고, PR CI는 `event == 'pull_request'`라 위 가드를 못 넘는다. 봇/포크 가드는 이중 방어.
- **권한**: `contents: write` + `pull-requests: write`만. **deploy 권한 없음 = prod read-only**
  (배포 스텝 없음, prod env/설정 미접근).
- **동시성**: run_id 기준 그룹으로 같은 사고에 중복 잡 방지.
- **스텝**:
  1. 가드 통과 시 checkout (main).
  2. **실패 로그 수집**: `gh run view <run_id> --log-failed` (실패 스텝만). 러너 내장 `gh`+`GH_TOKEN`.
  3. **secret 레닥션**: GitHub이 등록 시크릿을 로그에서 `***`로 이미 마스킹하지만, 토큰류
     정규식(sk-·phc_·ghp_·Bearer·긴 base64 등)으로 한 번 더 레닥션 → `redacted-logs.txt`.
  4. **claude-code-action** (`prompt`): 레닥션된 로그만 읽고 → 근본 원인 분석 →
     **최소 수정**을 `oncall/ci-fix-<run_id>` 브랜치에 커밋 → PR 오픈.
     - PR 본문: **무엇이 깨졌나 / 근본 원인 / 어떻게 고쳤나**.
     - 프롬프트 제약: `.env*`·prod 설정·Vercel 배포·CI 시크릿 **수정 금지**;
       로그 원문/시크릿 **본문에 붙여넣기 금지**; **머지 금지(사람 게이트)**; 최소 diff.

## 보안·안전 규칙

- 로그 속 secret 본문 노출 금지 — GitHub 마스킹 + 정규식 레닥션 이중.
- prod 직접 수정 금지 — autofix 잡에 deploy 권한/시크릿 없음, 프롬프트로 prod 파일 접근 차단.
- 자동 머지 금지 — 산출물은 PR뿐, 머지는 사람이.
- 무한루프 차단 — 봇/oncall 브랜치/포크가 트리거한 실패는 구조적·명시적으로 skip.

## 필요한 수동 준비 (에이전트가 못 하는 부분)

- GitHub 리포 Settings → Secrets and variables → Actions → **`ANTHROPIC_API_KEY`** 추가.
- Settings → Actions → General → Workflow permissions →
  **"Allow GitHub Actions to create and approve pull requests"** 체크.

## 검증 시나리오

1. **베이스 CI(로컬)**: `npm run lint && npm run test && npm run build` 통과 확인.
2. **CI red 감지**: 의도적 실패 테스트를 넣어 `ci.yml`이 실패로 잡히는지(PR/‏push) 확인.
3. **autofix 트리거(E2E)**: 시크릿·설정 완료 후 실패 커밋을 `main`에 push →
   `ci-autofix`가 깨어나 `oncall/ci-fix-*` PR을 여는지 확인. (또는 `workflow_dispatch`로 수동 검증.)
   확인 후 실패 테스트 제거.

## YAGNI (안 하는 것)

- 자동 머지, 자동 재시도 무한루프, PR 실패까지 자동수정, prod 핫픽스 직접 push.
