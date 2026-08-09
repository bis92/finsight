import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  getPolarClient: vi.fn(),
  getProfile: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}))
vi.mock('@/lib/polar/client', () => ({ getPolarClient: mocks.getPolarClient }))
vi.mock('@/services', () => ({ getProfileService: () => mocks.getProfile }))

import { POST } from './route'

describe('POST /api/portal', () => {
  const createSession = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('DATA_SOURCE', 'live')
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')
    mocks.getPolarClient.mockReturnValue({
      customerSessions: { create: createSession },
    })
    mocks.getProfile.mockResolvedValue({
      id: 'user-1',
      plan: 'pro',
      polarCustomerId: 'customer-1',
      polarSubscriptionId: 'sub-1',
    })
    createSession.mockResolvedValue({
      customerPortalUrl: 'https://polar.sh/portal/session-1',
    })
  })

  it('rejects an unauthenticated request before accessing Polar', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ message: '인증이 필요합니다' })
    expect(mocks.getPolarClient).not.toHaveBeenCalled()
  })

  it('returns 400 when the profile has no Polar customer id', async () => {
    mocks.getProfile.mockResolvedValue({
      id: 'user-1',
      plan: 'free',
      polarCustomerId: null,
      polarSubscriptionId: null,
    })

    const response = await POST()

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      message: '연결된 구독 정보를 찾을 수 없습니다',
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('creates a customer portal session for the linked customer', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: 'https://polar.sh/portal/session-1',
    })
    expect(createSession).toHaveBeenCalledWith({ customerId: 'customer-1' })
  })
})
