import { describe, expect, it } from 'vitest'

import { compareScores, isRegression, type LighthouseReport } from './decision'

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
