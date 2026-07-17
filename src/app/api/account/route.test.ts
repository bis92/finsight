import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  removeObjects: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}))
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))
vi.mock('@/lib/supabase/storage', () => ({ removeObjects: mocks.removeObjects }))

import { DELETE } from './route'

function createClient(options?: { deleteErrorTable?: string; foreignPath?: boolean }) {
  const calls: Array<{ operation: string; table: string; column?: string; value?: string }> = []
  const paths = options?.foreignPath
    ? [{ file_path: 'other-user/private.csv' }]
    : [{ file_path: 'user-1/first.csv' }, { file_path: 'user-1/second.csv' }]

  const client = {
    from: vi.fn((table: string) => ({
      select(column: string) {
        calls.push({ operation: 'select', table, column })
        return {
          eq(filterColumn: string, value: string) {
            calls.push({ operation: 'select-eq', table, column: filterColumn, value })
            return Promise.resolve({ data: paths, error: null })
          },
        }
      },
      delete() {
        calls.push({ operation: 'delete', table })
        return {
          eq(column: string, value: string) {
            calls.push({ operation: 'delete-eq', table, column, value })
            const error = options?.deleteErrorTable === table
              ? new Error(`database secret for ${table}`)
              : null
            return Promise.resolve({ error })
          },
        }
      },
    })),
  }

  return { client, calls }
}

describe('DELETE /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')
    mocks.removeObjects.mockResolvedValue(undefined)
  })

  it('deletes only the authenticated user originals and rows in dependency order', async () => {
    const { client, calls } = createClient()
    mocks.createSupabaseServerClient.mockResolvedValue(client)

    const response = await DELETE()

    expect(response.status).toBe(204)
    expect(mocks.removeObjects).toHaveBeenCalledWith([
      'user-1/first.csv',
      'user-1/second.csv',
    ])
    expect(calls).toEqual([
      { operation: 'select', table: 'uploads', column: 'file_path' },
      { operation: 'select-eq', table: 'uploads', column: 'user_id', value: 'user-1' },
      { operation: 'delete', table: 'transactions' },
      { operation: 'delete-eq', table: 'transactions', column: 'user_id', value: 'user-1' },
      { operation: 'delete', table: 'analyses' },
      { operation: 'delete-eq', table: 'analyses', column: 'user_id', value: 'user-1' },
      { operation: 'delete', table: 'subscriptions' },
      { operation: 'delete-eq', table: 'subscriptions', column: 'user_id', value: 'user-1' },
      { operation: 'delete', table: 'uploads' },
      { operation: 'delete-eq', table: 'uploads', column: 'user_id', value: 'user-1' },
    ])
  })

  it('rejects an unauthenticated request without accessing data', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null)

    const response = await DELETE()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ message: '인증이 필요합니다' })
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(mocks.removeObjects).not.toHaveBeenCalled()
  })

  it('does not delete a storage path outside the authenticated user prefix', async () => {
    const { client } = createClient({ foreignPath: true })
    mocks.createSupabaseServerClient.mockResolvedValue(client)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await DELETE()

    expect(response.status).toBe(500)
    expect(mocks.removeObjects).not.toHaveBeenCalled()
    expect(client.from).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('hides database failure details behind the generic internal error message', async () => {
    const { client } = createClient({ deleteErrorTable: 'analyses' })
    mocks.createSupabaseServerClient.mockResolvedValue(client)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await DELETE()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ message: '일시적인 오류가 발생했습니다' })
    expect(JSON.stringify(body)).not.toContain('database secret')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
