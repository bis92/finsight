#!/usr/bin/env bash
# PreToolUse(Bash) 훅 — 파괴적 셸 명령을 실행 전에 차단한다.
# Codex는 hook 입력을 stdin JSON으로 전달한다: { "tool_input": { "command": "..." }, ... }
# 위험 패턴 감지 시 exit 2 + stderr 사유 → Codex가 해당 툴 호출을 거부한다.
set -euo pipefail

input="$(cat)"
command="$(
  printf '%s' "$input" | python3 -c 'import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
print((data.get("tool_input") or {}).get("command", ""))' 2>/dev/null || true
)"

if printf '%s' "$command" | grep -qE 'rm[[:space:]]+-rf|git[[:space:]]+push[[:space:]]+--force|git[[:space:]]+reset[[:space:]]+--hard|DROP[[:space:]]+TABLE'; then
  echo "BLOCKED: 위험한 명령어가 감지되었습니다: ${command}" >&2
  exit 2
fi

exit 0
