import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

type ServerClientOptions = {
  cookies: {
    getAll: () => { name: string; value: string }[]
    setAll: (
      values: { name: string; value: string; options: { path: string } }[],
    ) => void
  }
}

const { cookieStore, createServerClientMock } = vi.hoisted(() => ({
  cookieStore: {
    getAll: vi.fn(() => [{ name: 'session', value: 'user-jwt' }]),
    set: vi.fn(),
  },
  createServerClientMock: vi.fn<
    (url: string, key: string, options: ServerClientOptions) => {
      kind: string
    }
  >(() => ({ kind: 'user-scoped-client' })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}))

import { createSupabaseServerClient } from '@/lib/supabase/server-client'

const originalEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

describe('createSupabaseServerClient', () => {
  afterEach(() => {
    vi.clearAllMocks()

    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('creates an anon-key client with the user session cookie adapter', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const client = await createSupabaseServerClient()

    expect(client).toEqual({ kind: 'user-scoped-client' })
    expect(createServerClientMock).toHaveBeenCalledOnce()
    const [url, key, options] = createServerClientMock.mock.calls[0]
    expect(url).toBe('https://project.supabase.co')
    expect(key).toBe('anon-key')
    expect(options.cookies.getAll()).toEqual([
      { name: 'session', value: 'user-jwt' },
    ])

    options.cookies.setAll([
      { name: 'refreshed', value: 'token', options: { path: '/' } },
    ])
    expect(cookieStore.set).toHaveBeenCalledWith('refreshed', 'token', {
      path: '/',
    })
  })

  it('throws before creating an SDK client when the anon key is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    await expect(createSupabaseServerClient()).rejects.toThrow(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set',
    )
    expect(createServerClientMock).not.toHaveBeenCalled()
  })
})
