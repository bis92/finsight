// review-code CI 게이트 판정. counts(단일 진실 원천)로 머지 정책을 계산한다.
export function decideGate(counts = {}) {
  const norm = (n) => {
    const v = Number(n)
    return Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0
  }
  const critical = norm(counts.critical)
  const major = norm(counts.major)
  const minor = norm(counts.minor)
  if (critical + major >= 1) {
    return { event: 'REQUEST_CHANGES', automerge: false, blocked: true }
  }
  if (minor >= 1) {
    return { event: 'APPROVE', automerge: false, blocked: false }
  }
  return { event: 'APPROVE', automerge: true, blocked: false }
}

// CLI: node scripts/review-gate.mjs <verdict.json>
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, appendFileSync } = await import('node:fs')
  const path = process.argv[2] || 'review-verdict.json'
  let decision
  try {
    const verdict = JSON.parse(readFileSync(path, 'utf8'))
    decision = decideGate(verdict.counts)
  } catch (err) {
    // fail-closed: 판정 없으면 머지 차단
    console.error(`[review-gate] verdict 읽기 실패 → fail-closed: ${err.message}`)
    decision = { event: 'REQUEST_CHANGES', automerge: false, blocked: true }
  }
  console.log(`[review-gate] ${JSON.stringify(decision)}`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `event=${decision.event}\nautomerge=${decision.automerge}\nblocked=${decision.blocked}\n`,
    )
  }
}
