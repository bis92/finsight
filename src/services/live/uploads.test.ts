import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

import {
  createUpload,
  listUploadsByUser,
  setUploadStatus,
} from '@/services/live/uploads'
import { listMockUploadsByUser } from '@/services/mock/uploads'
import type { UploadRow } from '@/types/database'

const row: UploadRow = {
  id: 'upload-1',
  user_id: 'user-1',
  file_path: 'user-1/upload-1-card.csv',
  original_name: 'card.csv',
  status: 'parsing',
  error_message: null,
  created_at: '2026-07-17T00:00:00Z',
}

const upload = {
  id: 'upload-1',
  userId: 'user-1',
  filePath: 'user-1/upload-1-card.csv',
  originalName: 'card.csv',
  status: 'parsing' as const,
  errorMessage: null,
}

describe('live uploads service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists user-scoped rows and maps them to the Upload contract', async () => {
    const order = vi.fn().mockResolvedValue({ data: [row], error: null })
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createSupabaseServerClientMock.mockResolvedValue({ from })

    await expect(listUploadsByUser('user-1')).resolves.toEqual([upload])
    expect(from).toHaveBeenCalledWith('uploads')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })

    const mockShape = Object.keys((await listMockUploadsByUser('user-1'))[0]!).sort()
    expect(Object.keys((await listUploadsByUser('user-1'))[0]!).sort()).toEqual(mockShape)
  })

  it('creates an upload in parsing status and maps the inserted row', async () => {
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const selectInserted = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select: selectInserted }))
    createSupabaseServerClientMock.mockResolvedValue({ from: vi.fn(() => ({ insert })) })

    await expect(createUpload('user-1', 'card.csv', 'user-1/upload-1-card.csv'))
      .resolves.toEqual(upload)
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      original_name: 'card.csv',
      file_path: 'user-1/upload-1-card.csv',
      status: 'parsing',
      error_message: null,
    })
  })

  it('transitions status only on the matching user upload', async () => {
    const updatedRow = { ...row, status: 'error' as const, error_message: 'CSV 형식 오류' }
    const maybeSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null })
    const selectUpdated = vi.fn(() => ({ maybeSingle }))
    const eqUpload = vi.fn(() => ({ select: selectUpdated }))
    const eqUser = vi.fn(() => ({ eq: eqUpload }))
    const update = vi.fn(() => ({ eq: eqUser }))
    createSupabaseServerClientMock.mockResolvedValue({ from: vi.fn(() => ({ update })) })

    await expect(setUploadStatus('user-1', 'upload-1', 'error', 'CSV 형식 오류'))
      .resolves.toEqual({ ...upload, status: 'error', errorMessage: 'CSV 형식 오류' })
    expect(update).toHaveBeenCalledWith({ status: 'error', error_message: 'CSV 형식 오류' })
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqUpload).toHaveBeenCalledWith('id', 'upload-1')
  })
})
