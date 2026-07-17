import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { aggregate } from '@/lib/analysis'
import { MOCK_TRANSACTIONS } from '@/services/mock/fixtures/transactions'
import { mockLlmService } from '@/services/mock/llm'
import { getMockProfile } from '@/services/mock/profile'
import { mockTransactionsRepository } from '@/services/mock/transactions'
import { liveTransactionsRepository } from '@/services/live/transactions'
import { listMockUploadsByUser } from '@/services/mock/uploads'
import {
  getLlmService,
  getProfileService,
  getTransactionsRepository,
  getUploadsService,
} from '@/services'
import type { ColumnMappingInput } from '@/types'

const mappingInput: ColumnMappingInput = {
  headers: ['이용일자', '가맹점명', '이용금액', '결제카드', '업종', '승인번호', '이용구분'],
  sampleRows: [
    ['2026-06-01', '배달의민족', '23900', '신한카드', '식비', '123456', '일시불'],
  ],
  locale: 'ko-KR',
}

describe('mockLlmService', () => {
  it('returns a deterministic valid column mapping for representative Korean card headers', async () => {
    const first = await mockLlmService.mapColumns(mappingInput)
    const second = await mockLlmService.mapColumns(mappingInput)

    expect(first).toEqual(second)
    expect(first).toEqual({
      mapping: { date: 0, merchant: 1, amount: 2, category: 4 },
      confidence: 0.74,
      missingRequired: [],
    })
  })

  it('returns distinct Free summaries and Pro diagnosis/suggestions using aggregate values', async () => {
    const snapshot = aggregate(MOCK_TRANSACTIONS, '2026-06')

    const free = await mockLlmService.generateInsights(snapshot, 'free')
    const pro = await mockLlmService.generateInsights(snapshot, 'pro')

    expect(free).toHaveLength(2)
    expect(new Set(free.map(({ kind }) => kind))).toEqual(new Set(['summary']))
    expect(pro.length).toBeGreaterThan(free.length)
    expect(pro.some(({ kind }) => kind === 'diagnosis')).toBe(true)
    expect(pro.some(({ kind }) => kind === 'suggestion')).toBe(true)
    expect(pro.flatMap(({ segments }) => segments).map(({ text }) => text).join(' '))
      .toContain(snapshot.totalExpense.toLocaleString('ko-KR'))
    expect([...free, ...pro].flatMap(({ segments }) => segments)
      .every(({ text }) => !/[<>*_`]/u.test(text))).toBe(true)
  })

  it('reuses the deterministic rule-based subscription detector', async () => {
    const candidates = await mockLlmService.detectSubscriptions(MOCK_TRANSACTIONS)

    expect(candidates.map(({ merchant }) => merchant)).toEqual([
      '에이블짐 헬스장',
      '유튜브 프리미엄',
      '넷플릭스',
      'Microsoft 365',
      '쿠팡 와우',
    ])
  })
})

describe('mockTransactionsRepository', () => {
  it('returns a user-scoped copy of all 35 fixture transactions deterministically', async () => {
    const first = await mockTransactionsRepository.listByUser('user-1')
    const second = await mockTransactionsRepository.listByUser('user-1')

    expect(first).toHaveLength(35)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.every(({ userId, amount }) => userId === 'user-1' && Number.isInteger(amount) && amount >= 0)).toBe(true)
  })

  it('returns the matching transaction with a replaced fixed-enum category', async () => {
    const updated = await mockTransactionsRepository.reclassify('user-1', 'mock-txn-1', '교통')

    expect(updated).toMatchObject({
      id: 'mock-txn-1',
      userId: 'user-1',
      merchant: '배달의민족',
      category: '교통',
    })
  })
})

describe('simple mock profile and upload functions', () => {
  it('selects a server-owned Pro fixture without accepting a plan argument', async () => {
    await expect(getMockProfile('user-1')).resolves.toMatchObject({ id: 'user-1', plan: 'free' })
    await expect(getMockProfile('mock-pro-user')).resolves.toMatchObject({
      id: 'mock-pro-user',
      plan: 'pro',
    })
    expect(getMockProfile).toHaveLength(1)
  })

  it('returns user-scoped upload fixture copies', async () => {
    const uploads = await listMockUploadsByUser('user-1')

    expect(uploads).toEqual([expect.objectContaining({
      userId: 'user-1',
      originalName: 'shinhan_card_2026-06.csv',
      status: 'done',
    })])
  })
})

describe('service factories', () => {
  const originalDataSource = process.env.DATA_SOURCE

  afterEach(() => {
    if (originalDataSource === undefined) {
      delete process.env.DATA_SOURCE
    } else {
      process.env.DATA_SOURCE = originalDataSource
    }
  })

  it('selects mock implementations by default', () => {
    delete process.env.DATA_SOURCE

    expect(getTransactionsRepository()).toBe(mockTransactionsRepository)
    expect(getLlmService()).toBe(mockLlmService)
    expect(getProfileService()).toBe(getMockProfile)
    expect(getUploadsService()).toBe(listMockUploadsByUser)
  })

  it('selects only the implemented live transactions repository and keeps other services closed', () => {
    process.env.DATA_SOURCE = 'live'

    expect(getTransactionsRepository()).toBe(liveTransactionsRepository)
    expect(() => getLlmService()).toThrowError('live not implemented')
    expect(() => getProfileService()).toThrowError('live not implemented')
    expect(() => getUploadsService()).toThrowError('live not implemented')
  })
})
