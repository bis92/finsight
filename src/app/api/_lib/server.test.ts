import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { getAuthenticatedUserIdMock } = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
}))

const { captureServerException } = vi.hoisted(() => ({
  captureServerException: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/analytics/server', () => ({ captureServerException }))

import { ApiRouteError, requireConfirmedMapping, resolveCurrentUserId, withErrorBoundary } from '@/app/api/_lib/server'

const originalDataSource = process.env.DATA_SOURCE

describe('requireConfirmedMapping', () => {
  it('accepts a card mapping with a single amount column', () => {
    const mapping = { date: 0, merchant: 1, amount: 2, debit: null, credit: null, category: 3 }
    expect(requireConfirmedMapping(mapping)).toBe(mapping)
  })

  it('accepts a bank mapping with 출금/입금 columns and no amount column', () => {
    const mapping = { date: 0, merchant: 1, amount: null, debit: 2, credit: 3, category: null }
    expect(requireConfirmedMapping(mapping)).toBe(mapping)
  })

  it('rejects a mapping missing every amount-bearing column', () => {
    const mapping = { date: 0, merchant: 1, amount: null, debit: null, credit: null, category: null }
    expect(() => requireConfirmedMapping(mapping)).toThrow(ApiRouteError)
  })

  it('rejects a mapping missing a core role', () => {
    const mapping = { date: null, merchant: 1, amount: 2, debit: null, credit: null, category: null }
    expect(() => requireConfirmedMapping(mapping)).toThrow(ApiRouteError)
  })
})

describe('resolveCurrentUserId', () => {
  afterEach(() => {
    vi.clearAllMocks()
    if (originalDataSource === undefined) delete process.env.DATA_SOURCE
    else process.env.DATA_SOURCE = originalDataSource
  })

  it('preserves the existing mock user id', async () => {
    process.env.DATA_SOURCE = 'mock'

    await expect(resolveCurrentUserId()).resolves.toBe('mock-free-user')
    expect(getAuthenticatedUserIdMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated live API access with 401', async () => {
    process.env.DATA_SOURCE = 'live'
    getAuthenticatedUserIdMock.mockResolvedValue(null)

    await expect(resolveCurrentUserId()).rejects.toEqual(
      expect.objectContaining<ApiRouteError>({ status: 401 }),
    )
  })

  it('resolves the authenticated Supabase user for live API access', async () => {
    process.env.DATA_SOURCE = 'live'
    getAuthenticatedUserIdMock.mockResolvedValue('live-user-123')

    await expect(resolveCurrentUserId()).resolves.toBe('live-user-123')
    expect(getAuthenticatedUserIdMock).toHaveBeenCalledOnce()
  })
})

describe('withErrorBoundary exception capture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not capture expected ApiRouteError', async () => {
    await withErrorBoundary(async () => { throw new ApiRouteError(400, 'bad') })
    expect(captureServerException).not.toHaveBeenCalled()
  })

  it('captures unexpected errors', async () => {
    const error = new Error('boom')
    await withErrorBoundary(async () => { throw error })
    expect(captureServerException).toHaveBeenCalledWith(error)
  })
})
