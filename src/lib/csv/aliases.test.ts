import { describe, expect, it } from 'vitest'

import { findHeaderIndex, hasRequiredRoles, matchColumnRole, missingRequiredRoles } from './aliases'

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

  it('matches bank debit/credit columns ahead of the generic amount role', () => {
    // 출금액·입금액은 모두 '금액'(amount) 별칭을 포함하지만 debit/credit이 우선한다.
    expect(matchColumnRole('출금액')).toBe('debit')
    expect(matchColumnRole('입금액')).toBe('credit')
    expect(matchColumnRole('출금')).toBe('debit')
    expect(matchColumnRole('입금')).toBe('credit')
    // 카드 단일 금액 컬럼은 그대로 amount로 남는다(회귀 방어).
    expect(matchColumnRole('이용금액')).toBe('amount')
    expect(matchColumnRole('결제금액')).toBe('amount')
  })
})

describe('hasRequiredRoles', () => {
  it('requires date, merchant, and any one amount-bearing role', () => {
    expect(hasRequiredRoles(new Set(['date', 'merchant', 'amount']))).toBe(true)
    expect(hasRequiredRoles(new Set(['date', 'merchant', 'debit']))).toBe(true)
    expect(hasRequiredRoles(new Set(['date', 'merchant', 'credit']))).toBe(true)
    expect(hasRequiredRoles(new Set(['date', 'merchant']))).toBe(false)
    expect(hasRequiredRoles(new Set(['merchant', 'amount']))).toBe(false)
  })
})

describe('missingRequiredRoles', () => {
  it('reports missing core roles and a representative amount role', () => {
    expect(missingRequiredRoles({ date: 0, merchant: 1, amount: 2, debit: null, credit: null, category: null })).toEqual([])
    expect(missingRequiredRoles({ date: 0, merchant: 1, amount: null, debit: 2, credit: 3, category: null })).toEqual([])
    expect(missingRequiredRoles({ date: null, merchant: 1, amount: 2, debit: null, credit: null, category: null })).toEqual(['date'])
    expect(missingRequiredRoles({ date: 0, merchant: 1, amount: null, debit: null, credit: null, category: null })).toEqual(['amount'])
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
