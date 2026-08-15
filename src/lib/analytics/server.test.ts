import { vi } from 'vitest'

const capture = vi.fn()
const captureException = vi.fn()
const shutdown = vi.fn().mockResolvedValue(undefined)
vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(() => ({ capture, captureException, shutdown })),
}))
vi.mock('../env', () => ({
  getPosthogToken: () => 'phc_test',
  getPosthogHost: () => 'https://us.i.posthog.com',
}))

import { captureServerEvent, captureServerException } from './server'
import { ANALYTICS_EVENTS } from './events'

beforeEach(() => vi.clearAllMocks())

it('captures a server event and flushes', async () => {
  await captureServerEvent('user-1', ANALYTICS_EVENTS.proActivated, { source: 'polar' })
  expect(capture).toHaveBeenCalledWith({
    distinctId: 'user-1',
    event: 'pro_activated',
    properties: { source: 'polar' },
  })
  expect(shutdown).toHaveBeenCalled()
})

it('captures an exception with context', async () => {
  const error = new Error('boom')
  await captureServerException(error, { route: '/api/x', method: 'POST' })
  expect(captureException).toHaveBeenCalledWith(error, undefined, { route: '/api/x', method: 'POST' })
  expect(shutdown).toHaveBeenCalled()
})
