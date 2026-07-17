import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  removeObjects,
  uploadObjectPath,
} from '@/lib/supabase/storage'

describe('uploads storage helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a user-owned path with a safely normalized filename', () => {
    expect(uploadObjectPath('user-1', 'upload-1', '../../내 카드/명세서 (6월).csv'))
      .toBe('user-1/upload-1-내-카드-명세서-6월-.csv')
  })

  it('creates a signed upload URL for only the requested user-owned path', async () => {
    const createSignedUploadUrlMock = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/upload', token: 'upload-token', path: 'user-1/upload-1-file.csv' },
      error: null,
    })
    const from = vi.fn(() => ({ createSignedUploadUrl: createSignedUploadUrlMock }))
    createSupabaseServerClientMock.mockResolvedValue({ storage: { from } })

    await expect(createSignedUploadUrl('user-1', 'user-1/upload-1-file.csv'))
      .resolves.toEqual({
        signedUrl: 'https://signed.example/upload',
        token: 'upload-token',
        path: 'user-1/upload-1-file.csv',
      })
    expect(from).toHaveBeenCalledWith('uploads')
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith('user-1/upload-1-file.csv')

    await expect(createSignedUploadUrl('user-1', 'user-2/upload-1-file.csv'))
      .rejects.toThrow('Invalid upload object path')
  })

  it('creates a short-lived signed download URL', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/download' },
      error: null,
    })
    const from = vi.fn(() => ({ createSignedUrl }))
    createSupabaseServerClientMock.mockResolvedValue({ storage: { from } })

    await expect(createSignedDownloadUrl('user-1/upload-1-file.csv', 120))
      .resolves.toEqual({ signedUrl: 'https://signed.example/download' })
    expect(createSignedUrl).toHaveBeenCalledWith('user-1/upload-1-file.csv', 120)
  })

  it('removes user-owned originals from the private uploads bucket', async () => {
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn(() => ({ remove }))
    createSupabaseServerClientMock.mockResolvedValue({ storage: { from } })
    const paths = ['user-1/upload-1-file.csv', 'user-1/upload-2-file.csv']

    await expect(removeObjects(paths)).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalledWith(paths)
  })
})
