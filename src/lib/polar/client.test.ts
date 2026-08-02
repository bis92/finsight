import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { polarConstructor } = vi.hoisted(() => ({
  polarConstructor: vi.fn(),
}))

vi.mock('@polar-sh/sdk', () => ({
  Polar: polarConstructor,
}))

async function importClient() {
  return import('./client')
}

describe('Polar server client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    // The client memoizes a singleton, so reset the module registry per test.
    vi.resetModules()
  })

  it('reads server-only Polar secrets and rejects missing values lazily', async () => {
    const { getPolarAccessToken, getPolarWebhookSecret } = await importClient()

    expect(() => getPolarAccessToken()).toThrow('POLAR_ACCESS_TOKEN is not set')
    expect(() => getPolarWebhookSecret()).toThrow('POLAR_WEBHOOK_SECRET is not set')

    vi.stubEnv('POLAR_ACCESS_TOKEN', 'polar-token')
    vi.stubEnv('POLAR_WEBHOOK_SECRET', 'webhook-secret')

    expect(getPolarAccessToken()).toBe('polar-token')
    expect(getPolarWebhookSecret()).toBe('webhook-secret')
  })

  it('constructs the SDK client with the access token and default production server', async () => {
    vi.stubEnv('POLAR_ACCESS_TOKEN', 'polar-token')
    const client = { checkouts: { create: vi.fn() } }
    polarConstructor.mockReturnValue(client)

    const { getPolarClient } = await importClient()

    expect(getPolarClient()).toBe(client)
    expect(polarConstructor).toHaveBeenCalledWith({
      accessToken: 'polar-token',
      server: 'production',
    })
  })

  it('targets the sandbox server when POLAR_SERVER is sandbox', async () => {
    vi.stubEnv('POLAR_ACCESS_TOKEN', 'polar-token')
    vi.stubEnv('POLAR_SERVER', 'sandbox')
    const client = { checkouts: { create: vi.fn() } }
    polarConstructor.mockReturnValue(client)

    const { getPolarClient } = await importClient()

    expect(getPolarClient()).toBe(client)
    expect(polarConstructor).toHaveBeenCalledWith({
      accessToken: 'polar-token',
      server: 'sandbox',
    })
  })
})
