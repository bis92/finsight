import { describe, expect, it } from 'vitest'

import { ANALYTICS_EVENTS } from './events'

describe('ANALYTICS_EVENTS', () => {
  it('exposes stable funnel event names', () => {
    expect(ANALYTICS_EVENTS.loginStarted).toBe('login_started')
    expect(ANALYTICS_EVENTS.proActivated).toBe('pro_activated')
    expect(ANALYTICS_EVENTS.dashboardViewed).toBe('dashboard_viewed')
  })

  it('has no duplicate event values', () => {
    const values = Object.values(ANALYTICS_EVENTS)
    expect(new Set(values).size).toBe(values.length)
  })
})
