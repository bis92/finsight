import { describe, expect, it } from 'vitest'

import { findHeaderIndex, matchColumnRole } from './aliases'

describe('matchColumnRole', () => {
  it('matches exact aliases per role', () => {
    expect(matchColumnRole('이용일자')).toBe('date')
    expect(matchColumnRole('가맹점명')).toBe('merchant')
    expect(matchColumnRole('이용금액')).toBe('amount')
    expect(matchColumnRole('업종')).toBe('category')
  })

  it('ignores surrounding whitespace and matches by containment', () => {
    expect(matchColumnRole(' 거래일시 ')).toBe('date')
    expect(matchColumnRole('거래내용')).toBe('merchant')
    expect(matchColumnRole('승인금액')).toBe('amount')
  })

  it('returns null for unknown headers', () => {
    expect(matchColumnRole('메모')).toBeNull()
    expect(matchColumnRole('')).toBeNull()
  })
})

describe('findHeaderIndex', () => {
  it('finds the first header index for a role', () => {
    const headers = ['이용일자', '가맹점명', '이용금액', '업종']
    expect(findHeaderIndex(headers, 'date')).toBe(0)
    expect(findHeaderIndex(headers, 'merchant')).toBe(1)
    expect(findHeaderIndex(headers, 'amount')).toBe(2)
    expect(findHeaderIndex(headers, 'category')).toBe(3)
  })

  it('returns null when no header matches the role', () => {
    expect(findHeaderIndex(['이용일자', '가맹점명'], 'amount')).toBeNull()
  })
})
