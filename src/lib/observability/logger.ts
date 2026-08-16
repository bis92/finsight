import { captureServerException } from '../analytics/server'

export async function logError(
  message: string,
  context?: { error?: unknown; distinctId?: string; route?: string; method?: string },
): Promise<void> {
  const { error, distinctId, route, method } = context ?? {}
  console.error(message, error)
  await captureServerException(error ?? new Error(message), { distinctId, route, method })
}

export function logWarn(message: string, context?: Record<string, unknown>): void {
  console.warn(message, context)
}
