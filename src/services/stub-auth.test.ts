import { describe, expect, it } from 'vitest'

import { canUseStubAuth } from './stub-auth'

describe('canUseStubAuth', () => {
  it('allows stub authentication only for the mock data source', () => {
    expect(canUseStubAuth('mock')).toBe(true)
    expect(canUseStubAuth('live')).toBe(false)
  })
})
