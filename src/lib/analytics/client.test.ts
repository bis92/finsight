import { it, expect, beforeEach, vi } from 'vitest'

vi.mock('posthog-js')

import posthog from 'posthog-js'
import { captureEvent, identifyUser, resetUser, setUserProperties } from './client'
import { ANALYTICS_EVENTS } from './events'

const posthogMock = vi.mocked(posthog)

beforeEach(() => vi.clearAllMocks())

it('captures events with properties', () => {
  captureEvent(ANALYTICS_EVENTS.dashboardViewed, { is_guest: false })
  expect(posthogMock.capture).toHaveBeenCalledWith('dashboard_viewed', { is_guest: false })
})

it('identifies user with distinct id', () => {
  identifyUser('user-1', { email: 'a@b.com' })
  expect(posthogMock.identify).toHaveBeenCalledWith('user-1', { email: 'a@b.com' })
})

it('resets on logout', () => {
  resetUser()
  expect(posthogMock.reset).toHaveBeenCalled()
})

it('sets person properties', () => {
  setUserProperties({ plan: 'pro' })
  expect(posthogMock.setPersonProperties).toHaveBeenCalledWith({ plan: 'pro' })
})
