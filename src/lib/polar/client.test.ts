import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { polarConstructor } = vi.hoisted(() => ({
  polarConstructor: vi.fn(),
}))

vi.mock('@polar-sh/sdk', () => ({
  Polar: polarConstructor,
}))

import {
  getPolarAccessToken,
  getPolarClient,
  getPolarWebhookSecret,
} from './client'

describe('Polar server client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('reads server-only Polar secrets and rejects missing values lazily', () => {
    expect(() => getPolarAccessToken()).toThrow('POLAR_ACCESS_TOKEN is not set')
    expect(() => getPolarWebhookSecret()).toThrow('POLAR_WEBHOOK_SECRET is not set')

    vi.stubEnv('POLAR_ACCESS_TOKEN', 'polar-token')
    vi.stubEnv('POLAR_WEBHOOK_SECRET', 'webhook-secret')

    expect(getPolarAccessToken()).toBe('polar-token')
    expect(getPolarWebhookSecret()).toBe('webhook-secret')
  })

  it('constructs the SDK client with the server access token on demand', () => {
    vi.stubEnv('POLAR_ACCESS_TOKEN', 'polar-token')
    const client = { checkouts: { create: vi.fn() } }
    polarConstructor.mockReturnValue(client)

    expect(getPolarClient()).toBe(client)
    expect(polarConstructor).toHaveBeenCalledWith({ accessToken: 'polar-token' })
  })
})
