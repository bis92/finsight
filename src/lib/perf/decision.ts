export type CategoryScores = {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
}

export type LighthouseReport = {
  url: string
  fetchedAt: string
  scores: CategoryScores
  metrics: { lcp: number; tbt: number; cls: number; fcp: number; si: number }
  opportunities: Array<{ id: string; title: string; savingsMs: number }>
}

const DEFAULT_PERF_NOISE_MARGIN = 2

export function compareScores(
  before: LighthouseReport,
  after: LighthouseReport,
  opts: { perfNoiseMargin?: number } = {},
): { improved: boolean; perfDelta: number } {
  const margin = opts.perfNoiseMargin ?? DEFAULT_PERF_NOISE_MARGIN
  const perfDelta = after.scores.performance - before.scores.performance
  return { improved: perfDelta >= margin, perfDelta }
}

const DEFAULT_CATEGORY_MARGIN = 2

export function isRegression(
  before: LighthouseReport,
  after: LighthouseReport,
  opts: { categoryMargin?: number } = {},
): boolean {
  const margin = opts.categoryMargin ?? DEFAULT_CATEGORY_MARGIN
  const guarded: Array<keyof CategoryScores> = ['accessibility', 'bestPractices', 'seo']
  return guarded.some((key) => after.scores[key] < before.scores[key] - margin)
}

export type IterationRecord = { performance: number; improved: boolean }
export type StopReason = 'target' | 'plateau' | 'hardCap' | null

const DEFAULT_TARGET_SCORE = 95
const DEFAULT_PLATEAU_N = 3
const DEFAULT_HARD_CAP = 15

export function shouldStop(
  history: IterationRecord[],
  opts: { targetScore?: number; plateauN?: number; hardCap?: number } = {},
): { stop: boolean; reason: StopReason } {
  const targetScore = opts.targetScore ?? DEFAULT_TARGET_SCORE
  const plateauN = opts.plateauN ?? DEFAULT_PLATEAU_N
  const hardCap = opts.hardCap ?? DEFAULT_HARD_CAP

  if (history.length === 0) return { stop: false, reason: null }

  const latest = history[history.length - 1]
  if (latest.performance >= targetScore) return { stop: true, reason: 'target' }

  if (history.length >= plateauN) {
    const recent = history.slice(-plateauN)
    if (recent.every((r) => !r.improved)) return { stop: true, reason: 'plateau' }
  }

  if (history.length >= hardCap) return { stop: true, reason: 'hardCap' }

  return { stop: false, reason: null }
}
