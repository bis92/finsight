import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { canUseStubAuth } from './stub-auth'
import { POST as stubLogin } from '@/app/api/auth/stub/route'

const originalDataSource = process.env.DATA_SOURCE

describe('canUseStubAuth', () => {
  afterEach(() => {
    if (originalDataSource === undefined) delete process.env.DATA_SOURCE
    else process.env.DATA_SOURCE = originalDataSource
  })

  it('allows stub authentication only for the mock data source', () => {
    expect(canUseStubAuth('mock')).toBe(true)
    expect(canUseStubAuth('live')).toBe(false)
  })

  it('fails closed when the stub login endpoint runs against live data', async () => {
    process.env.DATA_SOURCE = 'live'

    const response = await stubLogin()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      message: '스텁 로그인은 사용할 수 없습니다',
    })
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
