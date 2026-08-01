import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type {
  Insight,
  NewTransaction,
  Plan,
  Profile,
  Transaction,
  Upload,
} from '@/types'

const mocks = vi.hoisted(() => {
  let plan: Plan = 'free'

  const transactions: Transaction[] = [{
    id: 'txn-1',
    userId: 'server-owned-user',
    uploadId: 'upload-1',
    occurredOn: '2026-06-01',
    merchant: '테스트 가맹점',
    amount: 10_000,
    direction: 'expense',
    category: '식비',
    raw: {},
  }]
  const insights: Insight[] = [{
    title: '테스트 분석',
    kind: 'summary',
    segments: [{ text: '평문 분석', emphasis: false }],
  }]
  const upload: Upload = {
    id: 'upload-1',
    userId: 'server-owned-user',
    filePath: 'server-owned-user/test.csv',
    originalName: 'test.csv',
    status: 'done',
    errorMessage: null,
  }

  return {
    setPlan(nextPlan: Plan) {
      plan = nextPlan
    },
    listByUser: vi.fn(async () => transactions),
    insertMany: vi.fn(async (_userId: string, txns: NewTransaction[]) => ({
      inserted: txns.length,
    })),
    reclassify: vi.fn(async (_userId: string, _txnId: string, category) => ({
      ...transactions[0],
      category,
    })),
    mapColumns: vi.fn((input) => ({
      mapping: { date: 0, merchant: 1, amount: 2, category: null },
      confidence: input.sampleRows.length === 20 ? 0.9 : 0.8,
      missingRequired: [],
    })),
    buildFreeInsights: vi.fn(() => insights.map((item) => ({ ...item, title: `free:${item.title}` }))),
    generateProInsights: vi.fn(async () => insights.map((item) => ({ ...item, title: `pro:${item.title}` }))),
    detectSubscriptions: vi.fn(async () => [{
      merchant: '넷플릭스',
      amount: 13_500,
      cadence: 'monthly' as const,
      confidence: 0.9,
      lastSeenOn: '2026-06-17',
    }]),
    getProfile: vi.fn(async (userId: string): Promise<Profile> => ({ id: userId, plan })),
    listUploads: vi.fn(async () => [upload]),
  }
})

vi.mock('@/services', () => ({
  getTransactionsRepository: () => ({
    listByUser: mocks.listByUser,
    insertMany: mocks.insertMany,
    reclassify: mocks.reclassify,
  }),
  getLlmService: () => ({
    generateProInsights: mocks.generateProInsights,
    detectSubscriptions: mocks.detectSubscriptions,
  }),
  getProfileService: () => mocks.getProfile,
  getUploadsService: () => mocks.listUploads,
}))
vi.mock('@/lib/csv/mapping', () => ({ mapColumns: mocks.mapColumns }))
vi.mock('@/lib/analysis/insights', () => ({ buildFreeInsights: mocks.buildFreeInsights }))

import { GET as getInsights } from '@/app/api/insights/route'
import { GET as getProReport } from '@/app/api/pro-report/route'
import { PATCH as patchTransaction } from '@/app/api/transactions/[id]/route'
import { POST as mapUploadColumns } from '@/app/api/uploads/mapping/route'

describe('API Route Handlers', () => {
  beforeEach(() => {
    mocks.setPlan('free')
    vi.clearAllMocks()
  })

  it('blocks a Free user from receiving any Pro report data', async () => {
    const response = await getProReport(new Request('http://localhost/api/pro-report?period=2026-06'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ message: 'Pro 전용 기능입니다' })
    expect(mocks.generateProInsights).not.toHaveBeenCalled()
    expect(mocks.detectSubscriptions).not.toHaveBeenCalled()
  })

  it('returns Pro insights and subscription candidates for a server-profile Pro user', async () => {
    mocks.setPlan('pro')

    const response = await getProReport(new Request('http://localhost/api/pro-report?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe('pro:테스트 분석')
    expect(body.subscriptions).toEqual([expect.objectContaining({ merchant: '넷플릭스' })])
    expect(body.aiDegraded).toBe(false)
  })

  it('degrades the Pro report to internal insights when Opus fails (no 500)', async () => {
    mocks.setPlan('pro')
    mocks.generateProInsights.mockRejectedValueOnce(new Error('credit balance too low'))

    const response = await getProReport(new Request('http://localhost/api/pro-report?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.aiDegraded).toBe(true)
    expect(body.insights[0].title).toBe('free:테스트 분석')
    // 규칙 기반 구독 후보는 계속 제공된다
    expect(body.subscriptions).toEqual([expect.objectContaining({ merchant: '넷플릭스' })])
    expect(mocks.buildFreeInsights).toHaveBeenCalledTimes(1)
  })

  it('degrades the Pro insights route to internal insights when Opus fails', async () => {
    mocks.setPlan('pro')
    mocks.generateProInsights.mockRejectedValueOnce(new Error('credit balance too low'))

    const response = await getInsights(new Request('http://localhost/api/insights?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.aiDegraded).toBe(true)
    expect(body.insights[0].title).toBe('free:테스트 분석')
  })

  it('rejects a transaction category outside the fixed enum', async () => {
    const request = new Request('http://localhost/api/transactions/txn-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: '애완동물' }),
    })

    const response = await patchTransaction(request, {
      params: Promise.resolve({ id: 'txn-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ message: '카테고리가 유효하지 않습니다' })
    expect(mocks.reclassify).not.toHaveBeenCalled()
  })

  it('builds Free insights deterministically without the LLM', async () => {
    mocks.setPlan('free')

    const response = await getInsights(new Request('http://localhost/api/insights?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe('free:테스트 분석')
    expect(mocks.buildFreeInsights).toHaveBeenCalledTimes(1)
    expect(mocks.generateProInsights).not.toHaveBeenCalled()
  })

  it('uses Opus Pro insights for a Pro user on the insights route', async () => {
    mocks.setPlan('pro')

    const response = await getInsights(new Request('http://localhost/api/insights?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe('pro:테스트 분석')
    expect(mocks.generateProInsights).toHaveBeenCalledTimes(1)
    expect(mocks.buildFreeInsights).not.toHaveBeenCalled()
  })

  it('truncates mapping samples to 20 rows on the server', async () => {
    const sampleRows = Array.from({ length: 25 }, (_, index) => [`row-${index}`])
    const request = new Request('http://localhost/api/uploads/mapping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ headers: ['일자'], sampleRows, locale: 'ko-KR' }),
    })

    const response = await mapUploadColumns(request)

    expect(response.status).toBe(200)
    expect(mocks.mapColumns).toHaveBeenCalledWith(expect.objectContaining({
      sampleRows: sampleRows.slice(0, 20),
    }))
  })
})
