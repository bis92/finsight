import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { getAuthenticatedUserIdMock } = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
}))

import { ApiRouteError, resolveCurrentUserId } from '@/app/api/_lib/server'

const originalDataSource = process.env.DATA_SOURCE

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
