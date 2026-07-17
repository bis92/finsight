import { beforeEach, describe, expect, it, vi } from 'vitest'
import { File as NodeFile } from 'node:buffer'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getDataSource: vi.fn<() => 'mock' | 'live'>(),
  getAuthenticatedUserId: vi.fn(),
  createUpload: vi.fn(),
  setUploadStatus: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  insertMany: vi.fn(),
  listUploads: vi.fn(),
  getProfile: vi.fn(),
  countUploadsThisMonth: vi.fn(),
  mapColumns: vi.fn(),
  generateInsights: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ getDataSource: mocks.getDataSource }))
vi.mock('@/lib/auth/session', () => ({ getAuthenticatedUserId: mocks.getAuthenticatedUserId }))
vi.mock('@/lib/supabase/storage', () => ({
  createSignedUploadUrl: mocks.createSignedUploadUrl,
  uploadObjectPath: (userId: string, uploadId: string, originalName: string) =>
    `${userId}/${uploadId}-${originalName}`,
}))
vi.mock('@/services/live/uploads', () => ({
  createUpload: mocks.createUpload,
  setUploadStatus: mocks.setUploadStatus,
  countUploadsInRange: mocks.countUploadsThisMonth,
}))
vi.mock('@/services', () => ({
  getTransactionsRepository: () => ({ insertMany: mocks.insertMany }),
  getUploadsService: () => mocks.listUploads,
  getProfileService: () => mocks.getProfile,
  getLlmService: () => ({
    mapColumns: mocks.mapColumns,
    generateInsights: mocks.generateInsights,
  }),
}))

import { POST } from './route'

const mapping = { date: 0, merchant: 1, amount: 2, category: null }
const parsingUpload = {
  id: 'upload-1',
  userId: 'user-1',
  filePath: 'user-1/object-card.csv',
  originalName: 'card.csv',
  status: 'parsing' as const,
  errorMessage: null,
}
const doneUpload = { ...parsingUpload, status: 'done' as const }

function liveRequest(csv = '이용일자,가맹점명,이용금액\n2026-06-01,식당,12300\n2026-06-02,급여 입금,-3200000') {
  const entries = new Map<string, FormDataEntryValue>([
    ['file', new File([csv], 'card.csv', { type: 'text/csv' })],
    ['mapping', JSON.stringify(mapping)],
  ])
  const form = { get: (key: string) => entries.get(key) ?? null } as FormData
  const request = new Request('http://localhost/api/uploads', { method: 'POST' })
  vi.spyOn(request, 'formData').mockResolvedValue(form)
  return request
}

describe('POST /api/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('File', NodeFile)
    mocks.getDataSource.mockReturnValue('live')
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')
    mocks.createSignedUploadUrl.mockResolvedValue({
      signedUrl: 'https://storage.test/signed-upload',
      token: 'token',
      path: parsingUpload.filePath,
    })
    mocks.createUpload.mockResolvedValue(parsingUpload)
    mocks.setUploadStatus.mockResolvedValue(doneUpload)
    mocks.insertMany.mockResolvedValue({ inserted: 2 })
    mocks.listUploads.mockResolvedValue([doneUpload])
    mocks.getProfile.mockResolvedValue({ id: 'user-1', plan: 'free' })
    mocks.countUploadsThisMonth.mockResolvedValue(0)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
  })

  it('parses one CSV file, persists normalized transactions, and transitions parsing to done', async () => {
    const response = await POST(liveRequest())

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(doneUpload)
    expect(mocks.createUpload).toHaveBeenCalledWith(
      'user-1',
      'card.csv',
      expect.stringMatching(/^user-1\//),
    )
    expect(mocks.insertMany).toHaveBeenCalledWith('user-1', [
      expect.objectContaining({
        uploadId: 'upload-1',
        occurredOn: '2026-06-01',
        merchant: '식당',
        amount: 12_300,
        direction: 'expense',
      }),
      expect.objectContaining({
        uploadId: 'upload-1',
        amount: 3_200_000,
        direction: 'income',
        category: '수입',
      }),
    ])
    expect(mocks.setUploadStatus).toHaveBeenCalledWith('user-1', 'upload-1', 'done')
    expect(mocks.mapColumns).not.toHaveBeenCalled()
    expect(mocks.generateInsights).not.toHaveBeenCalled()
  })

  it('transitions parsing to error and hides persistence details from the response', async () => {
    mocks.insertMany.mockRejectedValue(new Error('postgres password=secret'))
    mocks.setUploadStatus.mockResolvedValue({
      ...parsingUpload,
      status: 'error',
      errorMessage: '일시적인 오류가 발생했습니다',
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(liveRequest())

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({ message: '일시적인 오류가 발생했습니다' })
    expect(JSON.stringify(body).includes('secret')).toBe(false)
    expect(mocks.setUploadStatus).toHaveBeenCalledWith(
      'user-1',
      'upload-1',
      'error',
      '일시적인 오류가 발생했습니다',
    )
    consoleError.mockRestore()
  })

  it('blocks a live Free user at five monthly uploads with the intended message', async () => {
    mocks.countUploadsThisMonth.mockResolvedValue(5)

    const response = await POST(liveRequest())

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({
      message: '이번 달 무료 업로드 5회를 모두 사용했습니다. Pro로 업그레이드하면 무제한입니다.',
    })
    expect(mocks.getProfile).toHaveBeenCalledWith('user-1')
    expect(mocks.createUpload).not.toHaveBeenCalled()
    expect(mocks.insertMany).not.toHaveBeenCalled()
  })

  it('allows a live Pro user regardless of monthly upload count', async () => {
    mocks.getProfile.mockResolvedValue({ id: 'user-1', plan: 'pro' })
    mocks.countUploadsThisMonth.mockResolvedValue(500)

    const response = await POST(liveRequest())

    expect(response.status).toBe(201)
  })

  it('keeps the existing mock JSON path unchanged', async () => {
    mocks.getDataSource.mockReturnValue('mock')
    const transaction = {
      uploadId: '',
      occurredOn: '2026-06-01',
      merchant: '식당',
      amount: 12_000,
      direction: 'expense',
      category: '식비',
      raw: {},
    }
    const request = new Request('http://localhost/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mapping, transactions: [transaction] }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(doneUpload)
    expect(mocks.listUploads).toHaveBeenCalledWith('mock-free-user')
    expect(mocks.insertMany).toHaveBeenCalledWith('mock-free-user', [
      { ...transaction, uploadId: 'upload-1' },
    ])
    expect(mocks.createUpload).not.toHaveBeenCalled()
    expect(mocks.getProfile).not.toHaveBeenCalled()
    expect(mocks.countUploadsThisMonth).not.toHaveBeenCalled()
  })
})
