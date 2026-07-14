import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    mapColumns: vi.fn(async (input) => ({
      mapping: { date: 0, merchant: 1, amount: 2, category: null },
      confidence: input.sampleRows.length === 20 ? 0.9 : 0.8,
      missingRequired: [],
    })),
    generateInsights: vi.fn(async (_aggregate, requestedPlan: Plan) => insights.map((item) => ({
      ...item,
      title: `${requestedPlan}:${item.title}`,
    }))),
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
    mapColumns: mocks.mapColumns,
    generateInsights: mocks.generateInsights,
    detectSubscriptions: mocks.detectSubscriptions,
  }),
  getProfileService: () => mocks.getProfile,
  getUploadsService: () => mocks.listUploads,
}))

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
    expect(mocks.generateInsights).not.toHaveBeenCalled()
    expect(mocks.detectSubscriptions).not.toHaveBeenCalled()
  })

  it('returns Pro insights and subscription candidates for a server-profile Pro user', async () => {
    mocks.setPlan('pro')

    const response = await getProReport(new Request('http://localhost/api/pro-report?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe('pro:테스트 분석')
    expect(body.subscriptions).toEqual([expect.objectContaining({ merchant: '넷플릭스' })])
    expect(mocks.getProfile).toHaveBeenCalledWith('mock-free-user')
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

  it.each<Plan>(['free', 'pro'])('generates %s insights using the server-profile plan', async (plan) => {
    mocks.setPlan(plan)

    const response = await getInsights(new Request(
      `http://localhost/api/insights?period=2026-06&plan=${plan === 'free' ? 'pro' : 'free'}`,
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe(`${plan}:테스트 분석`)
    expect(mocks.generateInsights).toHaveBeenCalledWith(expect.any(Object), plan)
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
