#!/usr/bin/env bash
# Stop 훅 — Codex가 턴을 마치기 직전에 lint · build · test 게이트를 실행한다.
# 실패 시 non-zero로 종료해 Codex가 결과를 인지하고 자가 교정하도록 한다.
set -uo pipefail

npm run lint 2>&1 && npm run build 2>&1 && npm run test 2>&1
