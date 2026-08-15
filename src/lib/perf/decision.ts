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
