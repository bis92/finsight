import { PostHog } from 'posthog-node'

import { getPosthogHost, getPosthogToken } from '../env'
import type { AnalyticsEvent } from './events'

function createClient(): PostHog | null {
  const token = getPosthogToken()
  if (!token) return null
  return new PostHog(token, { host: getPosthogHost(), flushAt: 1, flushInterval: 0 })
}

export async function captureServerEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): Promise<void> {
  const client = createClient()
  if (!client) return
  client.capture({ distinctId, event, properties })
  await client.shutdown()
}

export async function captureServerException(
  error: unknown,
  context?: { distinctId?: string; route?: string; method?: string },
): Promise<void> {
  const client = createClient()
  if (!client) return
  const { distinctId, ...rest } = context ?? {}
  client.captureException(error, distinctId, rest)
  await client.shutdown()
}
