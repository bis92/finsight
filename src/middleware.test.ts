import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}))

import { middleware } from '@/middleware'

const originalEnvironment = {
  DATA_SOURCE: process.env.DATA_SOURCE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

describe('session middleware', () => {
  afterEach(() => {
    vi.clearAllMocks()
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it.each(['/dashboard', '/upload', '/pro'])('redirects unauthenticated %s access to login', async (path) => {
    process.env.DATA_SOURCE = 'mock'
    const response = await middleware(new NextRequest(`http://localhost${path}`))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      `http://localhost/login?next=${encodeURIComponent(path)}`,
    )
  })

  it('allows the unauthenticated guest dashboard', async () => {
    process.env.DATA_SOURCE = 'mock'
    const response = await middleware(new NextRequest('http://localhost/dashboard?guest=1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('allows a mock stub session', async () => {
    process.env.DATA_SOURCE = 'mock'
    const request = new NextRequest('http://localhost/upload', {
      headers: { cookie: 'finsight_stub_session=mock-free-user' },
    })

    expect((await middleware(request)).status).toBe(200)
  })

  it('allows an authenticated live Supabase session', async () => {
    process.env.DATA_SOURCE = 'live'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } })

    expect((await middleware(new NextRequest('http://localhost/pro'))).status).toBe(200)
  })
})
