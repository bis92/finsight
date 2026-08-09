import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  push: vi.fn(),
  pathname: vi.fn(() => '/dashboard'),
  signOut: vi.fn(),
  post: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname(),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/queries/account', () => ({ useAccount: mocks.useAccount }))
vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut: mocks.signOut } }),
}))
vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return { ...actual, apiClient: { ...actual.apiClient, post: mocks.post } }
})
// matchMedia 의존 회피
vi.mock('./ThemeToggle', () => ({ ThemeToggle: () => null }))

import { AppShell } from './AppShell'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => {
    root.render(createElement(AppShell, null, createElement('main', null, '내용')))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pathname.mockReturnValue('/dashboard')
  mocks.signOut.mockResolvedValue({ error: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function findByText(text: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>('a,button')).find(
    (el) => el.textContent?.trim() === text,
  )
}

describe('AppShell', () => {
  it('shows the email and Pro badge, plus a manage-subscription action', async () => {
    mocks.useAccount.mockReturnValue({
      account: { email: 'me@finsight.dev', plan: 'pro' },
      isUnauthenticated: false,
    })
    await render()

    expect(container.textContent).toContain('me@finsight.dev')
    expect(container.textContent).toContain('Pro')
    expect(findByText('구독 관리')).toBeTruthy()
    expect(findByText('Pro로 업그레이드')).toBeFalsy()
  })

  it('shows an upgrade CTA for free accounts', async () => {
    mocks.useAccount.mockReturnValue({
      account: { email: 'free@finsight.dev', plan: 'free' },
      isUnauthenticated: false,
    })
    await render()

    const cta = findByText('Pro로 업그레이드') as HTMLAnchorElement
    expect(cta).toBeTruthy()
    expect(cta.getAttribute('href')).toBe('/pro')
    expect(findByText('구독 관리')).toBeFalsy()
  })

  it('signs out and redirects to /login', async () => {
    mocks.useAccount.mockReturnValue({
      account: { email: 'me@finsight.dev', plan: 'pro' },
      isUnauthenticated: false,
    })
    await render()

    await act(async () => {
      findByText('로그아웃')?.click()
    })

    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/login')
  })

  it('shows only a login link when unauthenticated', async () => {
    mocks.useAccount.mockReturnValue({ account: undefined, isUnauthenticated: true })
    await render()

    expect(findByText('로그인')).toBeTruthy()
    expect(findByText('로그아웃')).toBeFalsy()
  })

  it('marks the active nav item for the current path', async () => {
    mocks.useAccount.mockReturnValue({
      account: { email: 'me@finsight.dev', plan: 'pro' },
      isUnauthenticated: false,
    })
    mocks.pathname.mockReturnValue('/upload/mapping')
    await render()

    const active = Array.from(container.querySelectorAll<HTMLAnchorElement>('a'))
      .filter((a) => a.getAttribute('aria-current') === 'page')
      .map((a) => a.textContent?.trim())
    expect(active).toContain('파일 업로드')
  })

  it('calls /api/portal and navigates to the returned url when 구독 관리 is clicked', async () => {
    mocks.useAccount.mockReturnValue({
      account: { email: 'me@finsight.dev', plan: 'pro' },
      isUnauthenticated: false,
    })
    mocks.post.mockResolvedValue({ url: 'https://polar.sh/portal/x' })

    // stub window.location so jsdom does not throw on href assignment
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })

    try {
      await render()

      await act(async () => {
        findByText('구독 관리')?.click()
      })
      // flush microtasks
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      })

      expect(mocks.post).toHaveBeenCalledWith('/api/portal', {})
      expect(window.location.href).toBe('https://polar.sh/portal/x')
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('mobile drawer has a close button inside', async () => {
    mocks.useAccount.mockReturnValue({
      account: { email: 'me@finsight.dev', plan: 'pro' },
      isUnauthenticated: false,
    })
    await render()

    // open drawer
    const menuBtn = Array.from(container.querySelectorAll<HTMLElement>('button')).find(
      (b) => b.getAttribute('aria-label') === '메뉴 열기',
    )
    await act(async () => {
      menuBtn?.click()
    })

    // close button must exist inside the drawer aside
    const drawerAside = Array.from(container.querySelectorAll<HTMLElement>('aside')).find(
      (el) => el.getAttribute('aria-label') === '사이드바',
    )
    expect(drawerAside).toBeTruthy()

    const closeBtn = drawerAside?.querySelector<HTMLElement>('[aria-label="메뉴 닫기"]')
    expect(closeBtn).toBeTruthy()

    // clicking close should remove the drawer
    await act(async () => {
      closeBtn?.click()
    })
    expect(
      Array.from(container.querySelectorAll<HTMLElement>('aside')).find(
        (el) => el.getAttribute('aria-label') === '사이드바',
      ),
    ).toBeFalsy()
  })
})
