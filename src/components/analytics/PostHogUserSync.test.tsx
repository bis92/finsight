import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  let authCallback: (event: string, session: unknown) => void = () => {}

  return {
    identifyUser: vi.fn(),
    resetUser: vi.fn(),
    captureEvent: vi.fn(),
    getUser: vi.fn().mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'a@b.com',
          app_metadata: { provider: 'google' },
          created_at: '2026-01-01T00:00:00Z',
        },
      },
    }),
    onAuthStateChange: vi.fn((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    getAuthCallback: () => authCallback,
  }
})

vi.mock('@/lib/analytics/client', () => ({
  identifyUser: mocks.identifyUser,
  resetUser: mocks.resetUser,
  captureEvent: mocks.captureEvent,
}))

vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}))

import { PostHogUserSync } from './PostHogUserSync'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  // re-initialize the auth callback storage after clearAllMocks resets the mock
  mocks.onAuthStateChange.mockImplementation((cb) => {
    ;(mocks as unknown as { _authCallback: typeof cb })._authCallback = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-1',
        email: 'a@b.com',
        app_metadata: { provider: 'google' },
        created_at: '2026-01-01T00:00:00Z',
      },
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

it('identifies the current user on mount with expected properties', async () => {
  await act(async () => {
    root.render(createElement(PostHogUserSync, null))
  })
  // flush microtasks (getUser is async)
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })

  expect(mocks.identifyUser).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({
      email: 'a@b.com',
      auth_provider: 'google',
    }),
  )
})

it('resets on SIGNED_OUT', async () => {
  await act(async () => {
    root.render(createElement(PostHogUserSync, null))
  })
  // flush microtasks so onAuthStateChange is called
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })

  expect(mocks.onAuthStateChange).toHaveBeenCalled()

  // fire SIGNED_OUT via the captured callback
  const authCallback = (mocks as unknown as { _authCallback: (e: string, s: unknown) => void })
    ._authCallback
  act(() => {
    authCallback('SIGNED_OUT', null)
  })

  expect(mocks.resetUser).toHaveBeenCalled()
})
