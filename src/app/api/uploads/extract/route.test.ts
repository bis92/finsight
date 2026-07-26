import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getDataSource: vi.fn<() => 'mock' | 'live'>(),
  getAuthenticatedUserId: vi.fn(),
  extractTransactions: vi.fn(),
  getProfile: vi.fn(),
  countUploadsThisMonth: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ getDataSource: mocks.getDataSource }))
vi.mock('@/lib/auth/session', () => ({ getAuthenticatedUserId: mocks.getAuthenticatedUserId }))
vi.mock('@/services', () => ({
  getLlmService: () => ({ extractTransactions: mocks.extractTransactions }),
  getProfileService: () => mocks.getProfile,
}))
vi.mock('@/services/live/uploads', () => ({ countUploadsInRange: mocks.countUploadsThisMonth }))

import { POST } from './route'

const PDF_BASE64 = Buffer.from('%PDF-1.4\nstatement').toString('base64')
const extracted = [{
  uploadId: '', occurredOn: '2026-06-01', merchant: '배달의민족', amount: 23900,
  direction: 'expense' as const, category: '기타' as const, raw: {},
}]

function extractRequest(body: unknown) {
  return new Request('http://localhost/api/uploads/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/uploads/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDataSource.mockReturnValue('live')
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')
    mocks.getProfile.mockResolvedValue({ id: 'user-1', plan: 'free' })
    mocks.countUploadsThisMonth.mockResolvedValue(0)
    mocks.extractTransactions.mockResolvedValue(extracted)
  })

  it('extracts transactions from a PDF for an authenticated live user', async () => {
    const response = await POST(extractRequest({ fileName: 'statement.pdf', dataBase64: PDF_BASE64 }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(extracted)
    expect(mocks.extractTransactions).toHaveBeenCalledWith({ fileName: 'statement.pdf', dataBase64: PDF_BASE64 })
  })

  it('rejects a request that is missing the base64 payload', async () => {
    const response = await POST(extractRequest({ fileName: 'statement.pdf' }))

    expect(response.status).toBe(400)
    expect(mocks.extractTransactions).not.toHaveBeenCalled()
  })

  it('rejects a payload that is not a PDF', async () => {
    const response = await POST(extractRequest({ fileName: 'notes.txt', dataBase64: Buffer.from('hello').toString('base64') }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ message: 'PDF 파일이 아닙니다' })
    expect(mocks.extractTransactions).not.toHaveBeenCalled()
  })

  it('returns a business error when no transactions are found', async () => {
    mocks.extractTransactions.mockResolvedValue([])

    const response = await POST(extractRequest({ fileName: 'statement.pdf', dataBase64: PDF_BASE64 }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ message: '거래 내역을 찾지 못했습니다' })
  })

  it('requires authentication in live mode', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null)

    const response = await POST(extractRequest({ fileName: 'statement.pdf', dataBase64: PDF_BASE64 }))

    expect(response.status).toBe(401)
    expect(mocks.extractTransactions).not.toHaveBeenCalled()
  })

  it('enforces the Free upload cap before spending on extraction', async () => {
    mocks.countUploadsThisMonth.mockResolvedValue(5)

    const response = await POST(extractRequest({ fileName: 'statement.pdf', dataBase64: PDF_BASE64 }))

    expect(response.status).toBe(402)
    expect(mocks.extractTransactions).not.toHaveBeenCalled()
  })

  it('skips auth and the cap in mock mode', async () => {
    mocks.getDataSource.mockReturnValue('mock')

    const response = await POST(extractRequest({ fileName: 'statement.pdf', dataBase64: PDF_BASE64 }))

    expect(response.status).toBe(200)
    expect(mocks.getProfile).not.toHaveBeenCalled()
    expect(mocks.getAuthenticatedUserId).not.toHaveBeenCalled()
  })
})
