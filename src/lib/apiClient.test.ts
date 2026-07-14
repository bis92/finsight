import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiClient } from '@/lib/apiClient'

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON for a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ transactions: [{ id: 'txn-1' }] }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.get<{ transactions: Array<{ id: string }> }>(
      '/api/transactions',
    )).resolves.toEqual({ transactions: [{ id: 'txn-1' }] })
    expect(fetchMock).toHaveBeenCalledWith('/api/transactions', expect.objectContaining({
      method: 'GET',
    }))
  })

  it('throws ApiError with the server message unchanged for a failed response', async () => {
    const serverMessage = 'Pro 전용 기능입니다'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: serverMessage }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' },
      },
    )))

    const request = apiClient.get('/api/pro-report?period=2026-06')

    await expect(request).rejects.toBeInstanceOf(ApiError)
    await expect(request).rejects.toMatchObject({
      status: 403,
      message: serverMessage,
    })
  })
})
