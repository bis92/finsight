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

describe('POST /api/checkout', () => {
  const createCheckout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('POLAR_PRODUCT_ID', 'product-pro')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://finsight.example/')
    mocks.getPolarClient.mockReturnValue({ checkouts: { create: createCheckout } })
    mocks.getProfile.mockResolvedValue({
      id: 'user-1',
      plan: 'free',
      polarCustomerId: 'customer-1',
      polarSubscriptionId: null,
    })
    createCheckout.mockResolvedValue({ url: 'https://polar.sh/checkout/session-1' })
  })

  it('rejects an unauthenticated request before accessing Polar or profiles', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ message: '로그인이 필요합니다' })
    expect(mocks.getPolarClient).not.toHaveBeenCalled()
    expect(mocks.getProfile).not.toHaveBeenCalled()
  })

  it('creates a server-configured checkout linked to the authenticated user', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')

    const response = await POST()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: 'https://polar.sh/checkout/session-1',
    })
    expect(createCheckout).toHaveBeenCalledWith({
      products: ['product-pro'],
      successUrl: 'https://finsight.example/pro?checkout=success',
      returnUrl: 'https://finsight.example/pro?checkout=cancel',
      customerId: 'customer-1',
      externalCustomerId: 'user-1',
      metadata: { userId: 'user-1' },
    })
    expect(mocks.getProfile).toHaveBeenCalledWith('user-1')
    expect(mocks.getProfile).not.toHaveBeenCalledWith(expect.anything(), 'pro')
  })

  it('does not send a customer id when the user has no Polar customer mapping', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')
    mocks.getProfile.mockResolvedValue({ id: 'user-1', plan: 'free' })

    await POST()

    expect(createCheckout).toHaveBeenCalledWith(
      expect.not.objectContaining({ customerId: expect.anything() }),
    )
  })

  it('hides Polar errors behind the generic internal error message', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')
    createCheckout.mockRejectedValue(new Error('secret Polar failure'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ message: '일시적인 오류가 발생했습니다' })
    expect(JSON.stringify(body)).not.toContain('secret Polar failure')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
