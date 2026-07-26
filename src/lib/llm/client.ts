import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { getAnthropicApiKey } from '@/lib/env'

export const SONNET = 'claude-sonnet-4-6' as const
export const OPUS = 'claude-opus-4-8' as const

export type ClaudeModel = typeof SONNET | typeof OPUS

type JsonSchema = Record<string, unknown>

interface CompleteJsonInput {
  model: ClaudeModel
  system: string
  user: string
  schema: JsonSchema
  maxTokens?: number
}

interface CompleteJsonFromDocumentInput {
  model: ClaudeModel
  system: string
  text: string
  /** Base64-encoded PDF bytes (no data: URL prefix). */
  pdfBase64: string
  schema: JsonSchema
  maxTokens?: number
}

type StructuredResponse = {
  stop_reason: string
  content: Array<{ type: string; text?: string }>
}

function parseStructuredResponse<T>(response: StructuredResponse): T {
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude refused the request')
  }

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated')
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')

  if (!text) {
    throw new Error('Claude returned no structured output')
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Claude returned invalid structured output')
  }
}

// Adaptive thinking is required for both approved models. Do not add a final
// assistant prefill, thinking.budget_tokens, temperature, top_p, or top_k:
// Sonnet 4.6 and Opus 4.8 reject those combinations/removed parameters with 400.
// Use output_config.effort in task-specific callers when reasoning depth varies.
export function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: getAnthropicApiKey() })
}

export async function completeJson<T>({
  model,
  system,
  user,
  schema,
  maxTokens = 4096,
}: CompleteJsonInput): Promise<T> {
  const response = await getAnthropicClient().messages.create({
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: {
      format: {
        type: 'json_schema',
        schema,
      },
    },
    system,
    messages: [{ role: 'user', content: user }],
  })

  return parseStructuredResponse<T>(response as StructuredResponse)
}

// PDF document extraction. Claude reads the PDF natively (text + layout + tables)
// via a base64 document content block and returns schema-constrained JSON.
export async function completeJsonFromDocument<T>({
  model,
  system,
  text,
  pdfBase64,
  schema,
  maxTokens = 8192,
}: CompleteJsonFromDocumentInput): Promise<T> {
  const response = await getAnthropicClient().messages.create({
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: {
      format: {
        type: 'json_schema',
        schema,
      },
    },
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text },
      ],
    }],
  } as Parameters<ReturnType<typeof getAnthropicClient>['messages']['create']>[0])

  return parseStructuredResponse<T>(response as unknown as StructuredResponse)
}
