#!/usr/bin/env bash
# repo-preflight.sh — 세션 시작 시 리포 동시성 위험을 감지해 경고한다.
#
# 왜: 여러 워크트리에서 백그라운드 에이전트가 같은 리포를 동시에 커밋·머지하면
# 세션 도중 브랜치 tip과 origin/main이 움직여, "커밋할 게 있다/없다"가 계속 뒤집힌다.
# 세션 시작 시점에 이 상황을 먼저 알려주면 매 액션 전 상태 재확인을 유도할 수 있다.
#
# SessionStart 훅으로 실행된다. stdout은 세션 컨텍스트에 주입된다.

set -euo pipefail

# 이 리포가 아니면 조용히 종료 (다른 프로젝트에서 실행될 경우)
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

wt_count=$(git worktree list --porcelain 2>/dev/null | grep -c '^worktree ' || echo 0)

# 워크트리가 1개(메인)뿐이면 위험 없음 → 아무것도 출력하지 않는다.
if [ "${wt_count:-0}" -le 1 ]; then
  exit 0
fi

echo "⚠️  리포 동시성 경고 — 활성 워크트리 ${wt_count}개 감지"
echo "    다른 에이전트가 같은 리포를 동시에 편집·커밋·머지 중일 수 있습니다."
echo ""
git worktree list 2>/dev/null | sed 's/^/    /'
echo ""
echo "    → 커밋·push·머지·워크트리 삭제 전 반드시 'git fetch' 후 최신 상태를 재확인하세요."
echo "    → 세션 도중 브랜치 tip이나 origin/main이 바뀔 수 있습니다."

exit 0
