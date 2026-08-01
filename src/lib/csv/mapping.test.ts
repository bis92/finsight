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
      mapping: { date: 0, merchant: 1, amount: 2, category: 3 },
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

    expect(result.mapping).toEqual({ date: 0, merchant: 1, amount: 2, category: null })
    expect(result.confidence).toBe(0.85)
    expect(requiresManualMapping(result)).toBe(false)
  })

  it('flags missing required columns for manual mapping', () => {
    const result = mapColumns({
      headers: ['메모', '가맹점명', '수량'],
      sampleRows: [],
      locale: 'ko-KR',
    })

    expect(result.mapping).toEqual({ date: null, merchant: 1, amount: null, category: null })
    expect(result.confidence).toBe(0.4)
    expect(result.missingRequired).toEqual(['date', 'amount'])
    expect(requiresManualMapping(result)).toBe(true)
  })
})
