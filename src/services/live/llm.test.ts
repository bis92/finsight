import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { messagesCreate } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: messagesCreate }
  },
}))

import { requiresManualMapping } from '@/lib/csv'
import { OPUS, SONNET } from '@/lib/llm/client'
import { liveLlmService } from '@/services/live/llm'
import type { AggregateSnapshot } from '@/types'

const snapshot: AggregateSnapshot = {
  period: '2026-06',
  totalExpense: 1_000_000,
  totalIncome: 3_200_000,
  netExpense: -2_200_000,
  byCategory: [
    { category: '식비', amount: 400_000, ratio: 0.4 },
    { category: '주거', amount: 300_000, ratio: 0.3 },
  ],
  topMerchants: [{ merchant: '배달의민족', amount: 200_000, count: 4 }],
}

function mockJson(value: unknown) {
  messagesCreate.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(value) }],
  })
}

describe('liveLlmService.mapColumns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
  })

  it('uses Sonnet and returns a valid structured column mapping', async () => {
    messagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          mapping: { date: 0, merchant: 1, amount: 2, category: 3 },
          confidence: 0.96,
          missingRequired: [],
        }),
      }],
    })

    await expect(liveLlmService.mapColumns({
      headers: ['이용일자', '가맹점명', '이용금액', '업종'],
      sampleRows: [['2026.06.01', '배달의민족', '23900', '음식점']],
      locale: 'ko-KR',
    })).resolves.toEqual({
      mapping: { date: 0, merchant: 1, amount: 2, category: 3 },
      confidence: 0.96,
      missingRequired: [],
    })

    const request = messagesCreate.mock.calls[0][0]
    expect(request.model).toBe(SONNET)
    expect(request.output_config.format.type).toBe('json_schema')
    expect(request.system).toContain('신뢰할 수 없는 데이터')
    expect(request.messages[0].content).toContain('<csv_data>')
  })

  it('sends no more than 20 sample rows even when the input is larger', async () => {
    messagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          mapping: { date: 0, merchant: 1, amount: 2, category: null },
          confidence: 0.9,
          missingRequired: [],
        }),
      }],
    })
    const sampleRows = Array.from({ length: 25 }, (_, index) => [
      `2026.06.${String(index + 1).padStart(2, '0')}`,
      `가맹점 ${index}`,
      String(index * 1000),
    ])

    await liveLlmService.mapColumns({
      headers: ['일자', '가맹점', '금액'],
      sampleRows,
      locale: 'ko-KR',
    })

    const userContent = messagesCreate.mock.calls[0][0].messages[0].content as string
    const payload = JSON.parse(userContent.match(/<csv_data>\n([\s\S]+)\n<\/csv_data>/)?.[1] ?? '')
    expect(payload.sampleRows).toHaveLength(20)
    expect(payload.sampleRows).toEqual(sampleRows.slice(0, 20))
  })

  it('normalizes invalid indices and recomputes required missing roles', async () => {
    messagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          mapping: { date: 99, merchant: 1.5, amount: 2, category: -1 },
          confidence: 1.4,
          missingRequired: [],
        }),
      }],
    })

    await expect(liveLlmService.mapColumns({
      headers: ['일자', '가맹점', '금액'],
      sampleRows: [],
      locale: 'ko-KR',
    })).resolves.toEqual({
      mapping: { date: null, merchant: null, amount: 2, category: null },
      confidence: 1,
      missingRequired: ['date', 'merchant'],
    })
  })

  it('returns low-confidence and incomplete mappings for manual review', async () => {
    messagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          mapping: { date: 0, merchant: null, amount: 1, category: null },
          confidence: -0.2,
          missingRequired: ['amount'],
        }),
      }],
    })

    const result = await liveLlmService.mapColumns({
      headers: ['일자', '금액'],
      sampleRows: [['2026.06.01', '1000']],
      locale: 'ko-KR',
    })

    expect(result).toEqual({
      mapping: { date: 0, merchant: null, amount: 1, category: null },
      confidence: 0,
      missingRequired: ['merchant'],
    })
    expect(requiresManualMapping(result)).toBe(true)
  })
})

describe('liveLlmService.generateInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
  })

  it.each([
    ['free', SONNET, [{ title: '소비 요약', kind: 'summary', segments: [{ text: '식비가 가장 큽니다.', emphasis: true }] }]],
    ['pro', OPUS, [
      { title: '지출 진단', kind: 'diagnosis', segments: [{ text: '변동비를 점검하세요.', emphasis: false }] },
      { title: '절감 제안 1', kind: 'suggestion', segments: [{ text: '배달 횟수를 줄여보세요.', emphasis: false }], savingKrw: 20000 },
      { title: '절감 제안 2', kind: 'suggestion', segments: [{ text: '주간 한도를 정하세요.', emphasis: false }], savingKrw: 10000 },
    ]],
  ] as const)('uses the plan-specific model and returns the intended %s distribution', async (plan, model, insights) => {
    mockJson({ insights })

    const result = await liveLlmService.generateInsights(snapshot, plan)

    expect(messagesCreate.mock.calls[0][0].model).toBe(model)
    expect(result).toHaveLength(insights.length)
    expect(result.map(({ kind }) => kind)).toEqual(insights.map(({ kind }) => kind))
  })

  it('normalizes malformed insights and keeps only valid plain-text segments', async () => {
    mockJson({ insights: [
      { title: '잘못된 종류', kind: 'other', segments: [{ text: '제거', emphasis: false }] },
      { title: '빈 본문', kind: 'summary', segments: [] },
      { title: '진단', kind: 'diagnosis', segments: [{ text: '<strong>안전</strong> **본문**', emphasis: 'yes' }], savingKrw: 3000 },
      { title: '절감', kind: 'suggestion', segments: [{ text: '절감 가능', emphasis: true }], savingKrw: -1234.6 },
      { title: '반올림', kind: 'suggestion', segments: [{ text: '추가 절감', emphasis: false }], savingKrw: 1234.6 },
      { title: '문자 아님', kind: 'summary', segments: [{ text: 42, emphasis: false }] },
    ] })

    await expect(liveLlmService.generateInsights(snapshot, 'pro')).resolves.toEqual([
      { title: '진단', kind: 'diagnosis', segments: [{ text: '안전 본문', emphasis: false }] },
      { title: '절감', kind: 'suggestion', segments: [{ text: '절감 가능', emphasis: true }], savingKrw: 0 },
      { title: '반올림', kind: 'suggestion', segments: [{ text: '추가 절감', emphasis: false }], savingKrw: 1235 },
    ])
  })

  it('returns a deterministic safe insight without calling Claude for an empty aggregate', async () => {
    const empty = { ...snapshot, totalExpense: 0, totalIncome: 0, netExpense: 0, byCategory: [], topMerchants: [] }

    await expect(liveLlmService.generateInsights(empty, 'free')).resolves.toEqual([
      { title: '소비 분석', kind: 'summary', segments: [{ text: '분석할 거래 내역이 없습니다.', emphasis: false }] },
    ])
    expect(messagesCreate).not.toHaveBeenCalled()
  })

  it('provides only precomputed aggregate values and forbids model-side calculations', async () => {
    mockJson({ insights: [{ title: '요약', kind: 'summary', segments: [{ text: '요약입니다.', emphasis: false }] }] })

    await liveLlmService.generateInsights(snapshot, 'free')

    const request = messagesCreate.mock.calls[0][0]
    expect(request.messages[0].content).toContain(JSON.stringify(snapshot))
    expect(request.system).toContain('계산하지 마세요')
    expect(request.system).toContain('평문')
    expect(request.output_config.format.type).toBe('json_schema')
  })
})
