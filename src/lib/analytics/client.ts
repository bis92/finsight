import posthog from 'posthog-js'

import type { AnalyticsEvent } from './events'

export function captureEvent(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  posthog.capture(event, properties)
}

export function identifyUser(distinctId: string, properties?: Record<string, unknown>): void {
  posthog.identify(distinctId, properties)
}

export function resetUser(): void {
  posthog.reset()
}

export function setUserProperties(properties: Record<string, unknown>): void {
  posthog.setPersonProperties(properties)
}
