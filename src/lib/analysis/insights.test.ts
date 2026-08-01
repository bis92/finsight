import { describe, expect, it } from 'vitest'

import type { AggregateSnapshot } from '@/types'

import { buildFreeInsights } from './insights'

const snapshot: AggregateSnapshot = {
  period: '2026-06',
  totalExpense: 1_000_000,
  totalIncome: 3_200_000,
  netExpense: -2_200_000,
  byCategory: [
    { category: '식비', amount: 400_000, ratio: 0.4 },
    { category: '주거', amount: 300_000, ratio: 0.3 },
  ],
  topMerchants: [{ merchant: '배달의민족', amount: 200_000, count: 4 }],
}

describe('buildFreeInsights', () => {
  it('produces summary-only insights from precomputed aggregates', () => {
    const insights = buildFreeInsights(snapshot)

    expect(insights.every((insight) => insight.kind === 'summary')).toBe(true)
    expect(insights.every((insight) => insight.savingKrw === undefined)).toBe(true)
    expect(insights[0].segments.map((segment) => segment.text).join('')).toContain('1,000,000원')
    const topText = insights[1].segments.map((segment) => segment.text).join('')
    expect(topText).toContain('식비')
    expect(topText).toContain('400,000원')
    expect(topText).toContain('40%')
  })

  it('returns the deterministic empty-state insight when there is no data', () => {
    const empty: AggregateSnapshot = {
      period: '2026-06', totalExpense: 0, totalIncome: 0, netExpense: 0, byCategory: [], topMerchants: [],
    }

    expect(buildFreeInsights(empty)).toEqual([
      { title: '소비 분석', kind: 'summary', segments: [{ text: '분석할 거래 내역이 없습니다.', emphasis: false }] },
    ])
  })
})
