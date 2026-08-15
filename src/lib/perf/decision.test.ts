import { describe, expect, it } from 'vitest'

import {
  compareScores,
  isMetricRegression,
  isRegression,
  shouldStop,
  type IterationRecord,
  type LighthouseReport,
} from './decision'

function report(performance: number, overrides: Partial<LighthouseReport['scores']> = {}): LighthouseReport {
  return {
    url: 'http://localhost:3100/',
    fetchedAt: '2026-08-15T00:00:00.000Z',
    scores: { performance, accessibility: 100, bestPractices: 100, seo: 100, ...overrides },
    metrics: { lcp: 2000, tbt: 100, cls: 0, fcp: 1000, si: 1500 },
    opportunities: [],
  }
}

describe('compareScores', () => {
  it('reports perfDelta as after minus before', () => {
    expect(compareScores(report(70), report(78)).perfDelta).toBe(8)
    expect(compareScores(report(80), report(75)).perfDelta).toBe(-5)
  })

  it('marks improved only when perfDelta meets the noise margin (default 2)', () => {
    expect(compareScores(report(80), report(82)).improved).toBe(true)
    expect(compareScores(report(80), report(81)).improved).toBe(false)
    expect(compareScores(report(80), report(80)).improved).toBe(false)
  })

  it('respects a custom noise margin', () => {
    expect(compareScores(report(80), report(84), { perfNoiseMargin: 5 }).improved).toBe(false)
    expect(compareScores(report(80), report(85), { perfNoiseMargin: 5 }).improved).toBe(true)
  })
})

describe('isRegression', () => {
  it('returns false when non-performance categories hold or improve', () => {
    const before = report(70)
    const after = report(90) // 성능만 오르고 나머지는 100 유지
    expect(isRegression(before, after)).toBe(false)
  })

  it('flags regression when accessibility drops beyond the margin (default 2)', () => {
    const before = report(70)
    const after = report(90, { accessibility: 97 }) // 100 -> 97, -3
    expect(isRegression(before, after)).toBe(true)
  })

  it('ignores drops within the margin', () => {
    const before = report(70)
    const after = report(90, { seo: 98 }) // 100 -> 98, -2, 마진 이내
    expect(isRegression(before, after)).toBe(false)
  })

  it('ignores performance drops (performance is the optimization target, not a regression source)', () => {
    const before = report(90)
    const after = report(80)
    expect(isRegression(before, after)).toBe(false)
  })
})

function history(records: Array<[number, boolean]>): IterationRecord[] {
  return records.map(([performance, improved]) => ({ performance, improved }))
}

describe('shouldStop', () => {
  it('does not stop on empty history', () => {
    expect(shouldStop([])).toEqual({ stop: false, reason: null })
  })

  it('stops with reason target when latest performance meets targetScore (default 95)', () => {
    expect(shouldStop(history([[90, true], [96, true]]))).toEqual({ stop: true, reason: 'target' })
  })

  it('stops with reason plateau after plateauN consecutive non-improvements (default 3)', () => {
    expect(shouldStop(history([[80, true], [80, false], [80, false], [80, false]]))).toEqual({
      stop: true,
      reason: 'plateau',
    })
  })

  it('does not plateau-stop when improvements are interleaved', () => {
    expect(shouldStop(history([[80, false], [82, true], [82, false]]))).toEqual({ stop: false, reason: null })
  })

  it('stops with reason hardCap when iteration count reaches the cap', () => {
    const many = history(Array.from({ length: 15 }, () => [80, true] as [number, boolean]))
    expect(shouldStop(many)).toEqual({ stop: true, reason: 'hardCap' })
  })

  it('prefers target over hardCap when both hold', () => {
    const many = history(Array.from({ length: 15 }, (_, i) => [i === 14 ? 96 : 80, true] as [number, boolean]))
    expect(shouldStop(many)).toEqual({ stop: true, reason: 'target' })
  })
})

function withMetrics(metrics: Partial<LighthouseReport['metrics']>): LighthouseReport {
  const base = report(80)
  return { ...base, metrics: { ...base.metrics, ...metrics } }
}

describe('isMetricRegression', () => {
  it('returns false when core metrics hold or improve', () => {
    const before = withMetrics({ lcp: 2000, cls: 0, tbt: 100 })
    const after = withMetrics({ lcp: 1500, cls: 0, tbt: 80 })
    expect(isMetricRegression(before, after)).toBe(false)
  })

  it('flags LCP regression beyond the ratio (default 1.2)', () => {
    const before = withMetrics({ lcp: 2000 })
    expect(isMetricRegression(before, withMetrics({ lcp: 2401 }))).toBe(true) // +20.05%
    expect(isMetricRegression(before, withMetrics({ lcp: 2400 }))).toBe(false) // exactly +20%
  })

  it('flags CLS regression beyond the absolute delta (default 0.05)', () => {
    const before = withMetrics({ cls: 0 })
    expect(isMetricRegression(before, withMetrics({ cls: 0.06 }))).toBe(true)
    expect(isMetricRegression(before, withMetrics({ cls: 0.05 }))).toBe(false)
  })

  it('flags TBT regression beyond the ratio but ignores tiny values under the floor', () => {
    // 4ms -> 9ms: 큰 배율이지만 floor(50ms) 미만이라 무시
    expect(isMetricRegression(withMetrics({ tbt: 4 }), withMetrics({ tbt: 9 }))).toBe(false)
    // 100ms -> 200ms: floor 초과 + 1.5배 초과 -> 회귀
    expect(isMetricRegression(withMetrics({ tbt: 100 }), withMetrics({ tbt: 200 }))).toBe(true)
  })

  it('respects custom thresholds', () => {
    const before = withMetrics({ lcp: 2000 })
    expect(isMetricRegression(before, withMetrics({ lcp: 2200 }), { lcpRatio: 1.05 })).toBe(true)
  })
})
