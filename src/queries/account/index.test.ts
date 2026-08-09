import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/apiClient'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return { ...actual, apiClient: { ...actual.apiClient, get: mocks.get } }
})

import { useAccount } from './index'

let container: HTMLDivElement
let root: Root
let latest: ReturnType<typeof useAccount>

function Probe() {
  latest = useAccount()
  return null
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  await act(async () => {
    root.render(createElement(wrapper, null, createElement(Probe)))
  })
  // react-query 비동기 resolve 반영
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

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

describe('useAccount', () => {
  it('exposes the account summary on success', async () => {
    mocks.get.mockResolvedValue({ email: 'me@finsight.dev', plan: 'pro' })
    await mount()
    expect(latest.account).toEqual({ email: 'me@finsight.dev', plan: 'pro' })
    expect(latest.isUnauthenticated).toBe(false)
  })

  it('flags 401 as unauthenticated', async () => {
    mocks.get.mockRejectedValue(new ApiError(401, '인증이 필요합니다'))
    await mount()
    expect(latest.isUnauthenticated).toBe(true)
    expect(latest.account).toBeUndefined()
  })
})
