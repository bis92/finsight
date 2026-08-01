import { describe, expect, it } from 'vitest'

import { requiresManualMapping } from './index'
import { mapColumns } from './mapping'

describe('mapColumns (rule engine)', () => {
  it('maps all roles from known headers with high confidence', () => {
    const result = mapColumns({
      headers: ['이용일자', '가맹점명', '이용금액', '업종'],
      sampleRows: [['2026.06.01', '배달의민족', '23900', '음식점']],
      locale: 'ko-KR',
    })

    expect(result).toEqual({
      mapping: { date: 0, merchant: 1, amount: 2, debit: null, credit: null, category: 3 },
      confidence: 0.95,
      missingRequired: [],
    })
    expect(requiresManualMapping(result)).toBe(false)
  })

  it('keeps required-only mappings above the manual-review threshold', () => {
    const result = mapColumns({
      headers: ['거래일자', '가맹점', '거래금액'],
      sampleRows: [],
      locale: 'ko-KR',
    })

    expect(result.mapping).toEqual({ date: 0, merchant: 1, amount: 2, debit: null, credit: null, category: null })
    expect(result.confidence).toBe(0.85)
    expect(requiresManualMapping(result)).toBe(false)
  })

  it('maps a bank statement with separate 출금액/입금액 columns', () => {
    const result = mapColumns({
      headers: ['거래일시', '적요', '출금액', '입금액', '잔액'],
      sampleRows: [['2026-07-01', '스타벅스', '4,500', '', '120,000']],
      locale: 'ko-KR',
    })

    expect(result.mapping).toEqual({ date: 0, merchant: 1, amount: null, debit: 2, credit: 3, category: null })
    expect(result.missingRequired).toEqual([])
    expect(requiresManualMapping(result)).toBe(false)
  })

  it('flags missing required columns for manual mapping', () => {
    const result = mapColumns({
      headers: ['메모', '가맹점명', '수량'],
      sampleRows: [],
      locale: 'ko-KR',
    })

    expect(result.mapping).toEqual({ date: null, merchant: 1, amount: null, debit: null, credit: null, category: null })
    expect(result.confidence).toBe(0.4)
    expect(result.missingRequired).toEqual(['date', 'amount'])
    expect(requiresManualMapping(result)).toBe(true)
  })
})
