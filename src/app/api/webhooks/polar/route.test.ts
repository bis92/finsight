import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  validateEvent: vi.fn(),
  getPolarWebhookSecret: vi.fn(() => 'webhook-secret'),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@polar-sh/sdk/webhooks', () => ({
  validateEvent: mocks.validateEvent,
}))
vi.mock('@/lib/polar/client', () => ({
  getPolarWebhookSecret: mocks.getPolarWebhookSecret,
}))
vi.mock('@/lib/supabase/service-role-client', () => ({
  createSupabaseServiceRoleClient: mocks.createServiceRoleClient,
}))

import { POST } from './route'

function request(body: string): Request {
  return new Request('https://finsight.example/api/webhooks/polar', {
    method: 'POST',
    body,
    headers: {
      'webhook-id': 'event-1',
      'webhook-signature': 'valid-signature',
      'webhook-timestamp': '1784280000',
    },
  })
}

describe('POST /api/webhooks/polar', () => {
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  const maybeSingle = vi.fn()
  const selectEq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))
  const from = vi.fn(() => ({ update, select }))

  beforeEach(() => {
    vi.clearAllMocks()
    eq.mockResolvedValue({ error: null })
    maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.createServiceRoleClient.mockReturnValue({ from })
  })

  it('validates the raw body before setting the mapped profile to pro', async () => {
    const rawBody = '{"type":"subscription.active", "signed":true}'
    mocks.validateEvent.mockReturnValue({
      type: 'subscription.active',
      data: {
        id: 'subscription-1',
        customerId: 'customer-1',
        metadata: { userId: 'user-1' },
        customer: { externalId: 'user-1' },
      },
    })

    const response = await POST(request(rawBody))

    expect(response.status).toBe(200)
    expect(mocks.validateEvent).toHaveBeenCalledWith(
      rawBody,
      expect.objectContaining({
        'webhook-id': 'event-1',
        'webhook-signature': 'valid-signature',
        'webhook-timestamp': '1784280000',
      }),
      'webhook-secret',
    )
    expect(mocks.validateEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServiceRoleClient.mock.invocationCallOrder[0],
    )
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({
      plan: 'pro',
      polar_customer_id: 'customer-1',
      polar_subscription_id: 'subscription-1',
    })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns 401 and never creates a service-role client when verification fails', async () => {
    mocks.validateEvent.mockImplementation(() => {
      throw new Error('invalid signature details')
    })

    const response = await POST(request('{"forged":true}'))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ message: '웹훅 서명이 유효하지 않습니다' })
    expect(JSON.stringify(body)).not.toContain('invalid signature details')
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('is idempotent when the same active event is delivered twice', async () => {
    mocks.validateEvent.mockReturnValue({
      type: 'subscription.created',
      data: {
        id: 'subscription-1',
        customerId: 'customer-1',
        metadata: { userId: 'user-1' },
        customer: { externalId: null },
      },
    })

    expect((await POST(request('{}'))).status).toBe(200)
    expect((await POST(request('{}'))).status).toBe(200)

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenNthCalledWith(1, {
      plan: 'pro',
      polar_customer_id: 'customer-1',
      polar_subscription_id: 'subscription-1',
    })
    expect(update).toHaveBeenNthCalledWith(2, {
      plan: 'pro',
      polar_customer_id: 'customer-1',
      polar_subscription_id: 'subscription-1',
    })
  })

  it('does not update an arbitrary profile when no user mapping exists', async () => {
    mocks.validateEvent.mockReturnValue({
      type: 'subscription.active',
      data: {
        id: 'subscription-unknown',
        customerId: 'customer-unknown',
        metadata: {},
        customer: { externalId: null },
      },
    })

    const response = await POST(request('{}'))

    expect(response.status).toBe(200)
    expect(select).toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
