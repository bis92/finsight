import { describe, expect, it } from 'vitest'

import { CATEGORIES, categoryLabel } from '@/types/transaction'

describe('transaction categories', () => {
  it('provides a Korean label for every fixed category', () => {
    expect(CATEGORIES).toHaveLength(13)
    expect(CATEGORIES.map(categoryLabel)).toEqual(CATEGORIES)
    expect(CATEGORIES.every((category) => categoryLabel(category).length > 0)).toBe(true)
  })
})
