import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createSupabaseServerClientMock, exchangeCodeForSessionMock } = vi.hoisted(
  () => ({
    exchangeCodeForSessionMock: vi.fn(),
    createSupabaseServerClientMock: vi.fn(),
  }),
)

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

import { GET } from '@/app/auth/callback/route'

describe('OAuth callback Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { exchangeCodeForSession: exchangeCodeForSessionMock },
    })
    exchangeCodeForSessionMock.mockResolvedValue({ error: null })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('exchanges an authorization code and redirects to the default upload path', async () => {
    const response = await GET(new Request('https://finsight.test/auth/callback?code=oauth-code'))

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('oauth-code')
    expect(response.headers.get('location')).toBe('https://finsight.test/upload')
  })

  it('redirects to a validated internal next path after exchanging the code', async () => {
    const response = await GET(new Request(
      'https://finsight.test/auth/callback?code=oauth-code&next=%2Fdashboard%3Ftab%3Ddetail',
    ))

    expect(response.headers.get('location')).toBe(
      'https://finsight.test/dashboard?tab=detail',
    )
  })

  it.each([
    'https%3A%2F%2Fevil.test%2Fsteal',
    '%2F%2Fevil.test%2Fsteal',
  ])('rejects an external next target: %s', async (next) => {
    const response = await GET(new Request(
      `https://finsight.test/auth/callback?code=oauth-code&next=${next}`,
    ))

    expect(response.headers.get('location')).toBe('https://finsight.test/upload')
  })

  it('generalizes a provider error without exposing its description', async () => {
    const response = await GET(new Request(
      'https://finsight.test/auth/callback?error=access_denied&error_description=sensitive-sdk-detail',
    ))
    const location = response.headers.get('location')

    expect(location).toBe('https://finsight.test/login?error=oauth_failed')
    expect(location).not.toContain('sensitive-sdk-detail')
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('redirects to login when the authorization code is missing', async () => {
    const response = await GET(new Request('https://finsight.test/auth/callback'))

    expect(response.headers.get('location')).toBe(
      'https://finsight.test/login?error=oauth_failed',
    )
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
  })

  it('redirects to login without exposing a session exchange error', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      error: new Error('sensitive exchange failure'),
    })

    const response = await GET(new Request(
      'https://finsight.test/auth/callback?code=invalid-code',
    ))
    const location = response.headers.get('location')

    expect(location).toBe('https://finsight.test/login?error=oauth_failed')
    expect(location).not.toContain('sensitive')
    expect(console.error).toHaveBeenCalled()
  })
})
