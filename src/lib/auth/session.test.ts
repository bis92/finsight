import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createSupabaseServerClientMock, getUserMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

import { getAuthenticatedUserId } from '@/lib/auth/session'

describe('getAuthenticatedUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock },
    })
  })

  it('returns the authenticated user id', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    await expect(getAuthenticatedUserId()).resolves.toBe('user-123')
  })

  it('returns null when there is no authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } })

    await expect(getAuthenticatedUserId()).resolves.toBeNull()
  })
})
