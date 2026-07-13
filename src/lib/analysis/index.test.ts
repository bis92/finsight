import { describe, expect, it } from 'vitest'

import {
  aggregate,
  classify,
  classifyMany,
  detectSubscriptions,
} from '@/lib/analysis'
import type { NewTransaction, Transaction } from '@/types'

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'occurredOn' | 'merchant' | 'amount'>,
): Transaction {
  return {
    userId: 'user-1',
    uploadId: 'upload-1',
    direction: 'expense',
    category: '기타',
    raw: {},
    ...overrides,
  }
}

describe('classify', () => {
  it('maps known merchant keywords to the fixed category enum', () => {
    expect(classify(transaction({ id: '1', occurredOn: '2026-06-01', merchant: '스타벅스 강남점', amount: 6_100 }))).toBe('식비')
    expect(classify(transaction({ id: '2', occurredOn: '2026-06-02', merchant: '배달의민족', amount: 23_900 }))).toBe('식비')
    expect(classify(transaction({ id: '3', occurredOn: '2026-06-03', merchant: '서울 지하철', amount: 1_500 }))).toBe('교통')
    expect(classify(transaction({ id: '4', occurredOn: '2026-06-04', merchant: '넷플릭스', amount: 13_500 }))).toBe('구독')
  })

  it('returns income for credits and 기타 when no expense rule matches', () => {
    expect(classify(transaction({
      id: 'income',
      occurredOn: '2026-06-25',
      merchant: '급여 입금',
      amount: 3_200_000,
      direction: 'income',
    }))).toBe('수입')
    expect(classify(transaction({ id: 'unknown', occurredOn: '2026-06-05', merchant: '알 수 없는 상점', amount: 8_000 }))).toBe('기타')
  })

  it('classifies a batch without mutating the source transactions', () => {
    const input: NewTransaction[] = [{
      uploadId: 'upload-1',
      occurredOn: '2026-06-01',
      merchant: '카카오택시',
      amount: 12_000,
      direction: 'expense',
      category: '기타',
      raw: { 승인번호: '1234' },
    }]

    const result = classifyMany(input)

    expect(result[0]).toEqual({ ...input[0], category: '교통' })
    expect(input[0]?.category).toBe('기타')
  })
})

describe('aggregate', () => {
  it('calculates integer totals, refund-aware net expense, category ratios, and sorted merchants', () => {
    const transactions = [
      transaction({ id: '1', occurredOn: '2026-06-01', merchant: '배달의민족', amount: 30_000, category: '식비' }),
      transaction({ id: '2', occurredOn: '2026-06-02', merchant: '배달의민족', amount: 20_000, category: '식비' }),
      transaction({ id: '3', occurredOn: '2026-06-03', merchant: '무신사', amount: 40_000, category: '쇼핑' }),
      transaction({ id: '4', occurredOn: '2026-06-04', merchant: '서울교통공사', amount: 10_000, category: '교통' }),
      transaction({ id: '5', occurredOn: '2026-06-05', merchant: '무신사 환불', amount: 15_000, direction: 'income', category: '수입' }),
      transaction({ id: '6', occurredOn: '2026-06-25', merchant: '급여 입금', amount: 200_000, direction: 'income', category: '수입' }),
    ]

    const snapshot = aggregate(transactions, '2026-06')

    expect(snapshot).toMatchObject({
      period: '2026-06',
      totalExpense: 100_000,
      totalIncome: 215_000,
      netExpense: -115_000,
      byCategory: [
        { category: '식비', amount: 50_000, ratio: 0.5 },
        { category: '쇼핑', amount: 40_000, ratio: 0.4 },
        { category: '교통', amount: 10_000, ratio: 0.1 },
      ],
    })
    expect(snapshot.topMerchants).toEqual([
      { merchant: '배달의민족', amount: 50_000, count: 2 },
      { merchant: '무신사', amount: 40_000, count: 1 },
      { merchant: '서울교통공사', amount: 10_000, count: 1 },
    ])
    expect(Number.isInteger(snapshot.totalExpense)).toBe(true)
  })

  it('returns safe empty aggregates', () => {
    expect(aggregate([], '2026-06')).toEqual({
      period: '2026-06',
      totalExpense: 0,
      totalIncome: 0,
      netExpense: 0,
      byCategory: [],
      topMerchants: [],
    })
  })
})

describe('detectSubscriptions', () => {
  it('detects similar monthly charges across multiple months as a confidence-based candidate', () => {
    const candidates = detectSubscriptions([
      transaction({ id: '1', occurredOn: '2026-04-10', merchant: '넷플릭스', amount: 13_500, category: '구독' }),
      transaction({ id: '2', occurredOn: '2026-05-10', merchant: '넷플릭스', amount: 13_500, category: '구독' }),
      transaction({ id: '3', occurredOn: '2026-06-11', merchant: '넷플릭스', amount: 13_900, category: '구독' }),
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      merchant: '넷플릭스',
      amount: 13_633,
      cadence: 'monthly',
      lastSeenOn: '2026-06-11',
    })
    expect(candidates[0]?.confidence).toBeGreaterThan(0.5)
    expect(candidates[0]?.confidence).toBeLessThanOrEqual(1)
  })

  it('marks a subscription-like single-month charge as unknown with lower confidence', () => {
    const candidates = detectSubscriptions([
      transaction({ id: '1', occurredOn: '2026-06-03', merchant: '유튜브 프리미엄', amount: 14_900, category: '구독' }),
      transaction({ id: '2', occurredOn: '2026-06-05', merchant: '일반 상점', amount: 9_000 }),
    ])

    expect(candidates).toEqual([{
      merchant: '유튜브 프리미엄',
      amount: 14_900,
      cadence: 'unknown',
      confidence: 0.45,
      lastSeenOn: '2026-06-03',
    }])
  })

  it('detects weekly repetition, excludes income, and handles empty input safely', () => {
    const candidates = detectSubscriptions([
      transaction({ id: '1', occurredOn: '2026-06-01', merchant: '주간 클래스', amount: 20_000 }),
      transaction({ id: '2', occurredOn: '2026-06-08', merchant: '주간 클래스', amount: 20_000 }),
      transaction({ id: '3', occurredOn: '2026-06-15', merchant: '주간 클래스', amount: 20_000 }),
      transaction({ id: '4', occurredOn: '2026-06-01', merchant: '정기 입금', amount: 20_000, direction: 'income', category: '수입' }),
      transaction({ id: '5', occurredOn: '2026-06-08', merchant: '정기 입금', amount: 20_000, direction: 'income', category: '수입' }),
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ merchant: '주간 클래스', cadence: 'weekly' })
    expect(detectSubscriptions([])).toEqual([])
  })
})
