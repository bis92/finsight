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
import { SONNET } from '@/lib/llm/client'
import { liveLlmService } from '@/services/live/llm'

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
