# Step 2: deploy-script

## 읽어야 할 파일

먼저 아래 파일들을 읽고, 배포 방식·전환 정책을 파악하라:

- `/CLAUDE.md` (배포: Vercel · 시크릿은 서버 전용 env)
- `/docs/ARCHITECTURE.md` ('배포' 절 — `vercel pull → build → deploy --prebuilt --prod`, mock 상태부터 배포, 전환은 env로만)
- `/docs/ADR.md` (ADR-001 Vercel CLI 자동 배포)
- Step 1: `docs/DEPLOYMENT.md` (시크릿 등록·전환 순서 — 스크립트가 전제하는 env)
- 참조: `scripts/execute.py`(비대화식 실행 관례 — 스크립트도 비대화식이어야 함)

## 작업

`scripts/deploy.sh` — Vercel CLI 배포를 자동화하는 셸 스크립트를 만든다. **mock/live 공통(불변)**: 스크립트는 어떤 `DATA_SOURCE`에서도 동일하게 동작하고, mock↔live 전환은 오직 Vercel 환경변수(`DATA_SOURCE`)로만 이뤄진다. 스크립트 안에 `DATA_SOURCE` 값을 하드코딩하지 마라.

1. **셸 스크립트 규격**
   - 상단에 `#!/usr/bin/env bash` + `set -euo pipefail`(엄격 모드). 비대화식(프롬프트 없이) 실행.
   - 파이프라인(ARCHITECTURE.md 배포 절 그대로):
     1. `vercel pull --yes --environment=production`  — 프로젝트 설정·env를 로컬로 가져온다
     2. `vercel build --prod`                          — 프로덕션 빌드(prebuilt 산출)
     3. `vercel deploy --prebuilt --prod`              — 빌드 산출물을 프로덕션 배포
   - 토큰: `vercel` 명령은 `VERCEL_TOKEN` 환경변수(있으면 `--token "$VERCEL_TOKEN"`)로 인증할 수 있게 한다. 토큰을 스크립트에 하드코딩하지 마라.
   - 실패 시(`set -e`) 즉시 비영점 종료. 각 단계 전 간단한 진행 로그(echo)만.
   - `vercel` CLI 미설치 시 명확한 안내 후 비영점 종료(예: `command -v vercel`로 사전 체크).

2. **불변성·전환 정책 명시**
   - 스크립트 상단 주석에: "이 스크립트는 mock/live 공통이다. 데이터소스 전환은 Vercel의 `DATA_SOURCE` env로만 한다. 스크립트를 수정하지 말 것."
   - CRITICAL: 시크릿·토큰을 스크립트에 절대 기재하지 마라. 이유: CLAUDE.md — 시크릿은 env로만.

3. **실행 권한** — `chmod +x scripts/deploy.sh`.

이 step은 스크립트 **작성·문법 검증**까지가 scope다. 실제 `vercel` 배포 실행은 Vercel 로그인·토큰·프로젝트 링크가 필요하므로 사용자 개입 영역이다. 실제 배포까지 요구되면 그 사실을 blocked로 처리한다.

## Acceptance Criteria

```bash
bash -n scripts/deploy.sh
npm run build
npm test
```

- `bash -n scripts/deploy.sh` — 문법 오류 없음(구문 파싱 통과).
- `scripts/deploy.sh`에 실행 권한이 있는지 확인(`test -x scripts/deploy.sh`).
- 코드 변경이 없으므로 `npm run build`·`npm test`는 회귀 방지(기존 그대로 통과).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 파이프라인이 `vercel pull → build → deploy --prebuilt --prod` 순서인가?
   - 스크립트에 시크릿·토큰·`DATA_SOURCE` 값이 하드코딩돼 있지 않은가?
   - mock/live 공통(불변)임이 주석으로 명시됐는가?
   - `set -euo pipefail`로 실패 시 안전하게 중단하는가?
3. 결과에 따라 `phases/6-launch/index.json`의 step 2를 업데이트한다:
   - 스크립트 작성·문법 검증 완료 → `"status": "completed"`, `"summary": "deploy.sh 파이프라인·불변성 요약"`
   - 실제 Vercel 배포 실행이 요구되나 로그인/토큰/프로젝트 링크 부재 → `"status": "blocked"`, `"blocked_reason": "필요한 것(Vercel 로그인·VERCEL_TOKEN·프로젝트 링크)"` 후 중단
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`

## 금지사항

- 스크립트에 시크릿·`VERCEL_TOKEN` 값·`DATA_SOURCE` 값을 하드코딩하지 마라. 이유: CLAUDE.md — 시크릿·스위치는 env로만.
- mock용/live용 스크립트를 따로 만들지 마라. 하나의 불변 스크립트 + env 전환만. 이유: ARCHITECTURE.md 배포 절 — 배포 스크립트 불변.
- 대화식 프롬프트(로그인 대기 등)를 스크립트에 넣지 마라. 이유: 비대화식 실행 관례(`execute.py`).
- 배포 파이프라인 순서를 임의로 바꾸지 마라(prebuilt 없이 deploy 등). 이유: `--prebuilt`는 `vercel build` 산출물을 전제한다.
- 기존 테스트를 깨뜨리지 마라.
