import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getDataSource } from '@/lib/env'

const originalDataSource = process.env.DATA_SOURCE

describe('getDataSource', () => {
  afterEach(() => {
    if (originalDataSource === undefined) {
      delete process.env.DATA_SOURCE
      return
    }

    process.env.DATA_SOURCE = originalDataSource
  })

  it('returns mock when DATA_SOURCE is not set', () => {
    delete process.env.DATA_SOURCE

    expect(getDataSource()).toBe('mock')
  })
})
