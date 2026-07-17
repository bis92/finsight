import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

import { getProfile } from '@/services/live/profile'
import { getMockProfile } from '@/services/mock/profile'
import type { ProfileRow } from '@/types/database'

const row: ProfileRow = {
  id: 'user-1',
  plan: 'pro',
  polar_subscription_id: 'subscription-1',
  polar_customer_id: 'customer-1',
  created_at: '2026-07-17T00:00:00Z',
}

describe('live profile service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the user profile by id and maps it to the mock Profile contract', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const insert = vi.fn()
    const update = vi.fn()
    const upsert = vi.fn()
    const from = vi.fn(() => ({ select, insert, update, upsert }))
    createSupabaseServerClientMock.mockResolvedValue({ from })

    const profile = await getProfile('user-1')

    expect(profile).toEqual({
      id: 'user-1',
      plan: 'pro',
      polarSubscriptionId: 'subscription-1',
      polarCustomerId: 'customer-1',
    })
    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('*')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(Object.keys(profile).sort()).toEqual(
      Object.keys(await getMockProfile('mock-pro-user')).sort(),
    )
    expect(insert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('fails closed to the free plan when a new user profile row is absent', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    createSupabaseServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({ select })),
    })

    await expect(getProfile('new-user')).resolves.toEqual({
      id: 'new-user',
      plan: 'free',
      polarSubscriptionId: null,
      polarCustomerId: null,
    })
  })
})
