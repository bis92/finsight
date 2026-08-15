import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('posthog-js', () => ({ default: { captureException: vi.fn() } }))

import posthog from 'posthog-js'
import ErrorPage from './error'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

it('captures the error and renders a fallback', async () => {
  const error = Object.assign(new Error('boom'), { digest: 'abc' })
  const reset = vi.fn()

  await act(async () => {
    root.render(createElement(ErrorPage, { error, reset }))
  })

  expect(posthog.captureException).toHaveBeenCalledWith(error)
  expect(container.querySelector('[role="alert"]')).toBeTruthy()
})
