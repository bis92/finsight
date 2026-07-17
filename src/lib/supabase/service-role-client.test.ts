import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn<
    (
      url: string,
      key: string,
      options: Record<string, unknown>,
    ) => { kind: string }
  >(() => ({ kind: 'service-role-client' })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role-client'

const originalEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}

describe('createSupabaseServiceRoleClient', () => {
  afterEach(() => {
    vi.clearAllMocks()

    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('creates a server-only client with the service-role key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    const client = createSupabaseServiceRoleClient()

    expect(client).toEqual({ kind: 'service-role-client' })
    expect(createClientMock).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'service-role-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )
  })

  it('throws before creating an SDK client when the service-role key is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    expect(createSupabaseServiceRoleClient).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY is not set',
    )
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
