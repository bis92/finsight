import { vi } from 'vitest'

vi.mock('../analytics/server', () => ({
  captureServerException: vi.fn().mockResolvedValue(undefined),
}))

import { logError, logWarn } from './logger'
import { captureServerException } from '../analytics/server'

beforeEach(() => vi.clearAllMocks())

it('logs error to console and PostHog', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const error = new Error('boom')
  await logError('upload failed', { error, route: '/api/uploads' })
  expect(spy).toHaveBeenCalledWith('upload failed', error)
  expect(captureServerException).toHaveBeenCalledWith(error, { distinctId: undefined, route: '/api/uploads', method: undefined })
  spy.mockRestore()
})

it('logs warn to console only', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  logWarn('mapping not found')
  expect(spy).toHaveBeenCalledWith('mapping not found', undefined)
  expect(captureServerException).not.toHaveBeenCalled()
  spy.mockRestore()
})
