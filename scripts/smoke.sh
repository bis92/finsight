#!/usr/bin/env bash
#
# smoke.sh — 브라우저 없이 dev 서버의 500(5xx)을 잡는 HTTP 스모크 테스트.
#
# 왜: next dev 가 .next 캐시 오염/중복 기동으로 간헐적 500을 뿜을 때,
#     매번 브라우저로 확인하지 않고 한 번에 전 라우트 상태코드를 검증한다.
#     (참고: dev-server-next-cache-hazard — 중복 next dev 는 500의 흔한 원인)
#
# 사용법:
#   npm run smoke              # 스크립트가 clean 서버를 자체 기동→검증→종료
#   SMOKE_BASE=http://localhost:3000 npm run smoke   # 이미 떠 있는 서버에 대고 검증(기동 생략)
#
# 종료코드: 5xx 가 하나라도 있으면 1, 전부 통과면 0 (CI/훅에서 게이트로 사용 가능).

set -uo pipefail

PORT="${SMOKE_PORT:-3100}"
BASE="${SMOKE_BASE:-http://localhost:$PORT}"
OWN_SERVER=0
DEV_PID=""
LOG="$(mktemp -t finsight-smoke.XXXXXX.log)"

# 예상 상태코드: 페이지는 200/307(로그인 리다이렉트), API 는 인증/메서드/검증에 따른 4xx 까지 정상.
# 5xx 만 실패로 취급한다.
PAGES=(/ /login /dashboard /pro /upload /upload/mapping)
GET_APIS=(/api/account /api/profile /api/insights /api/transactions /api/uploads)

cleanup() {
  if [[ "$OWN_SERVER" == "1" && -n "$DEV_PID" ]]; then
    kill "$DEV_PID" 2>/dev/null
    # next dev 는 자식 프로세스를 남기므로 그룹까지 정리
    pkill -P "$DEV_PID" 2>/dev/null
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

# 이미 떠 있는 서버가 없으면 clean 하게 자체 기동
if ! curl -s -o /dev/null "$BASE/" 2>/dev/null; then
  echo "▶ dev 서버 기동 (PORT=$PORT, clean)…"
  PORT="$PORT" npm run dev >"$LOG" 2>&1 &
  DEV_PID=$!
  OWN_SERVER=1
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "$BASE/" 2>/dev/null && break
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
      echo "✗ dev 서버가 기동 중 종료됨. 로그:"; tail -30 "$LOG"; exit 1
    fi
    sleep 0.5
  done
fi

echo "▶ 스모크 대상: $BASE"
FAIL=0

check() {
  local path="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [[ "$code" =~ ^5 ]]; then
    printf "  \033[31m✗ %-24s %s\033[0m\n" "$path" "$code"
    FAIL=1
  else
    printf "  \033[32m✓ %-24s %s\033[0m\n" "$path" "$code"
  fi
}

echo "— 페이지 라우트 —"
for p in "${PAGES[@]}"; do check "$p"; done
echo "— GET API 라우트 —"
for p in "${GET_APIS[@]}"; do check "$p"; done

# 에셋 검증: 페이지가 200이어도 참조하는 CSS/JS 가 404 면 무스타일/깨진 화면이 된다.
# (dev-server-next-cache-hazard: .next 매니페스트 불일치로 layout.css 가 404 → unstyled)
echo "— 참조 에셋 (CSS/JS) —"
ASSETS=$(curl -s "$BASE/" | grep -oE '/_next/static/(css|chunks)/[^"?]+\.(css|js)' | sort -u)
if [[ -z "$ASSETS" ]]; then
  printf "  \033[31m✗ 홈에서 참조 에셋을 못 찾음 (렌더 실패 가능)\033[0m\n"
  FAIL=1
else
  for a in $ASSETS; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$a")
    if [[ "$code" == "200" ]]; then
      printf "  \033[32m✓ %-48s %s\033[0m\n" "$a" "$code"
    else
      printf "  \033[31m✗ %-48s %s  ← 무스타일/깨진 화면 원인\033[0m\n" "$a" "$code"
      FAIL=1
    fi
  done
fi

# 자체 기동한 경우, 서버 로그에서 런타임 컴파일 에러도 함께 확인
if [[ "$OWN_SERVER" == "1" ]] && grep -qE "⨯|Error:|Unhandled" "$LOG"; then
  echo "— 서버 로그 경고 —"
  grep -nE "⨯|Error:|Unhandled" "$LOG" | head -10
  FAIL=1
fi

if [[ "$FAIL" == "1" ]]; then
  echo "✗ 스모크 실패 — 5xx / 에셋 404 / 서버 에러 감지"
  exit 1
fi
echo "✓ 스모크 통과 — 5xx 없음, 에셋 정상"
