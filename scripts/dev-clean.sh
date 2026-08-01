#!/usr/bin/env bash
#
# dev-clean.sh — 캐시 오염을 확실히 털고 "단일" dev 서버를 기동한다.
#
# 왜: .next 를 실행 중인 서버 밑에서 지우면 그 서버가 wedged 되어
#     `ENOENT ... .next/server/pages/_document.js` / 무스타일 / 500 이 난다.
#     (dev-server-next-cache-hazard) 그래서 반드시 "먼저 kill → 그다음 삭제 → 단일 기동" 순서.
#
# 사용법: npm run dev:clean   (PORT=3001 npm run dev:clean 로 포트 지정 가능)

set -uo pipefail

# 1) 돌던 next 를 모두 종료 (중복·wedged 서버 제거)
if pgrep -f "next dev" >/dev/null 2>&1 || pgrep -f "next-server" >/dev/null 2>&1; then
  echo "▶ 기존 next 서버 종료…"
  pkill -f "next dev" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  # 포트가 풀릴 때까지 잠깐 대기
  for _ in $(seq 1 10); do
    pgrep -f "next-server" >/dev/null 2>&1 || break
    sleep 0.3
  done
fi

# 2) 서버가 멈춘 뒤에야 .next 삭제 (실행 중 삭제는 wedge 유발이라 순서 엄수)
echo "▶ .next 캐시 삭제…"
node -e "require('fs').rmSync('.next',{recursive:true,force:true})"

# 3) 단일 dev 서버 기동
echo "▶ dev 서버 기동…"
exec next dev
