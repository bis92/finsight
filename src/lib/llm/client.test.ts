import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { anthropicConstructor, messagesCreate } = vi.hoisted(() => ({
  anthropicConstructor: vi.fn(),
  messagesCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: messagesCreate }

    constructor(options: { apiKey: string }) {
      anthropicConstructor(options)
    }
  },
}))

import {
  completeJson,
  completeJsonFromDocument,
  getAnthropicClient,
  OPUS,
  SONNET,
} from '@/lib/llm/client'

const originalApiKey = process.env.ANTHROPIC_API_KEY

describe('Claude client', () => {
  afterEach(() => {
    vi.clearAllMocks()
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalApiKey
  })

  it('exposes the approved model identifiers', () => {
    expect(SONNET).toBe('claude-sonnet-4-6')
    expect(OPUS).toBe('claude-opus-4-8')
  })

  it('lazily creates a client with the server-only API key', () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'

    getAnthropicClient()

    expect(anthropicConstructor).toHaveBeenCalledWith({ apiKey: 'test-api-key' })
  })

  it('throws clearly when the API key is missing', () => {
    delete process.env.ANTHROPIC_API_KEY

    expect(getAnthropicClient).toThrow('ANTHROPIC_API_KEY is not set')
    expect(anthropicConstructor).not.toHaveBeenCalled()
  })

  it('requests and parses structured JSON with adaptive thinking', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    messagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"result":"ok"}' }],
    })
    const schema = {
      type: 'object',
      properties: { result: { type: 'string' } },
      required: ['result'],
      additionalProperties: false,
    }

    await expect(completeJson<{ result: string }>({
      model: OPUS,
      system: 'system instruction',
      user: 'user input',
      schema,
    })).resolves.toEqual({ result: 'ok' })

    expect(messagesCreate).toHaveBeenCalledWith({
      model: OPUS,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema } },
      system: 'system instruction',
      messages: [{ role: 'user', content: 'user input' }],
    })
    const request = messagesCreate.mock.calls[0][0]
    expect(request.thinking).not.toHaveProperty('budget_tokens')
    expect(request).not.toHaveProperty('temperature')
    expect(request).not.toHaveProperty('top_p')
    expect(request).not.toHaveProperty('top_k')
  })

  it.each([
    ['refusal', 'Claude refused the request'],
    ['max_tokens', 'Claude response was truncated'],
  ])('rejects %s responses', async (stopReason, message) => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    messagesCreate.mockResolvedValue({ stop_reason: stopReason, content: [] })

    await expect(completeJson({
      model: SONNET,
      system: 'system instruction',
      user: 'user input',
      schema: { type: 'object' },
    })).rejects.toThrow(message)
  })

  it('sends a PDF document content block with a text prompt for structured extraction', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    messagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"transactions":[]}' }],
    })
    const schema = { type: 'object', additionalProperties: false }

    await expect(completeJsonFromDocument<{ transactions: unknown[] }>({
      model: SONNET,
      system: 'system instruction',
      text: 'extract transactions',
      pdfBase64: 'JVBERi0=',
      schema,
      maxTokens: 8192,
    })).resolves.toEqual({ transactions: [] })

    const request = messagesCreate.mock.calls[0][0]
    expect(request.model).toBe(SONNET)
    expect(request.max_tokens).toBe(8192)
    expect(request.thinking).toEqual({ type: 'adaptive' })
    expect(request.output_config).toEqual({ format: { type: 'json_schema', schema } })
    expect(request.messages).toEqual([{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } },
        { type: 'text', text: 'extract transactions' },
      ],
    }])
    expect(request).not.toHaveProperty('temperature')
  })

  it('rejects truncated document responses', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    messagesCreate.mockResolvedValue({ stop_reason: 'max_tokens', content: [] })

    await expect(completeJsonFromDocument({
      model: SONNET,
      system: 'system',
      text: 'extract',
      pdfBase64: 'JVBERi0=',
      schema: { type: 'object' },
    })).rejects.toThrow('Claude response was truncated')
  })
})
