# 앱 사이드바 + 계정·구독 상태 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 앱 어디서나 로그인 계정(이메일)·구독 상태(Pro/free)를 확인하고 로그아웃·업그레이드·구독 관리를 할 수 있는 좌측 사이드바 셸을 도입한다.

**Architecture:** 인증된 앱 페이지(`/dashboard`, `/upload`, `/upload/mapping`, `/pro`)의 상단 헤더(`TopNav`)를 좌측 사이드바 셸(`AppShell`)로 대체한다. 계정 요약은 신규 `GET /api/account`(email+plan), 구독 관리는 신규 `POST /api/portal`(Polar 고객 포털 세션)로 제공하고, 클라이언트는 공용 `apiClient`/react-query 단일 경로로 소비한다. 로그아웃은 브라우저 supabase 클라이언트의 `signOut`으로 처리한다.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind, @supabase/ssr, @polar-sh/sdk, @tanstack/react-query, Vitest(jsdom, react-dom/client + act — @testing-library 미사용).

## Global Constraints

- 외부 API 호출(Polar/Supabase service-role)은 서버에서만. 클라이언트 직접 호출 금지.
- 시크릿은 서버 전용 env. `NEXT_PUBLIC_` 접두사 금지(브라우저는 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`만 사용).
- 데이터 페칭은 `src/queries/<domain>` + react-query 단일 경로, 공용 `apiClient`/`ApiError` 경유(모두 `/api/*`).
- 내부 예외를 사용자 메시지로 노출 금지. 5xx는 일반 문구(`withErrorBoundary`), 의도된 검증/권한 메시지(401/400)는 서버 `message` 그대로.
- API 에러는 서버 응답 `message`를 그대로 노출. 상태코드→한글 치환 테이블 금지.
- `plan`은 `types/`의 `Plan` enum('free'|'pro')만 사용. 자유 문자열 금지.
- 읽기 전용은 SideView/Drawer, 입력/수정은 Modal(이 기능은 읽기+액션이라 Drawer 계열).
- TDD 강제(tdd-guard 훅): `lib/`·`services/`·라우트 로직은 테스트 선작성.
- 커밋 메시지는 conventional commits.
- 브랜치: `feat/app-sidebar-account`(이미 생성됨). 스펙 커밋 완료.

---

### Task 1: 계정 요약 API — `GET /api/account`

**Files:**
- Modify: `src/types/plan.ts` (AccountSummary 타입 추가)
- Modify: `src/lib/auth/session.ts` (`getAuthenticatedUser` 추가)
- Modify: `src/app/api/_lib/server.ts` (`resolveCurrentUser` + `MOCK_CURRENT_USER_EMAIL` 추가)
- Modify: `src/app/api/account/route.ts` (`GET` 추가; 기존 `DELETE` 유지)
- Test: `src/app/api/account/route.test.ts` (신규)

**Interfaces:**
- Produces:
  - `type AccountSummary = { email: string | null; plan: Plan }` (from `@/types`)
  - `getAuthenticatedUser(): Promise<{ id: string; email: string | null } | null>` (from `@/lib/auth/session`)
  - `resolveCurrentUser(): Promise<{ id: string; email: string | null }>` (from `@/app/api/_lib/server`)
  - `GET`(`/api/account`) → `200 { email, plan }` | `401 { message }`
- Consumes: `getProfileService()` (from `@/services`), `getDataSource()` (from `@/lib/env`), 기존 `withErrorBoundary`/`ApiRouteError`.

- [ ] **Step 1: AccountSummary 타입 추가**

`src/types/plan.ts` 끝에 추가:

```ts
export type AccountSummary = {
  email: string | null
  plan: Plan
}
```

- [ ] **Step 2: 실패 테스트 작성**

`src/app/api/account/route.test.ts` 생성:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getProfile: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  // DELETE 경로가 참조하는 기존 export 보존
  getAuthenticatedUserId: vi.fn(),
}))
vi.mock('@/services', () => ({ getProfileService: () => mocks.getProfile }))

import { GET } from './route'

describe('GET /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('DATA_SOURCE', 'live')
    mocks.getAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'me@finsight.dev' })
    mocks.getProfile.mockResolvedValue({
      id: 'user-1',
      plan: 'pro',
      polarCustomerId: 'customer-1',
      polarSubscriptionId: 'sub-1',
    })
  })

  it('returns the authenticated account email and plan', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      email: 'me@finsight.dev',
      plan: 'pro',
    })
    expect(mocks.getProfile).toHaveBeenCalledWith('user-1')
  })

  it('returns 401 without touching the profile when unauthenticated', async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ message: '인증이 필요합니다' })
    expect(mocks.getProfile).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/app/api/account/route.test.ts`
Expected: FAIL — `GET`가 export되지 않음 / `resolveCurrentUser` 없음.

- [ ] **Step 4: `getAuthenticatedUser` 추가**

`src/lib/auth/session.ts`에 추가(기존 `getAuthenticatedUserId` 유지):

```ts
/** Returns the authenticated user's id and email, preserving RLS context. */
export async function getAuthenticatedUser(): Promise<
  { id: string; email: string | null } | null
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  return { id: data.user.id, email: data.user.email ?? null }
}
```

- [ ] **Step 5: `resolveCurrentUser` 추가**

`src/app/api/_lib/server.ts`의 import에서 세션 헬퍼를 확장:

```ts
import { getAuthenticatedUser, getAuthenticatedUserId } from '@/lib/auth/session'
```

`MOCK_CURRENT_USER_ID` 아래에 상수 추가:

```ts
const MOCK_CURRENT_USER_EMAIL = 'mock-free-user@finsight.dev'
```

`resolveCurrentUserId` 함수 바로 아래에 추가:

```ts
export async function resolveCurrentUser(): Promise<{
  id: string
  email: string | null
}> {
  if (getDataSource() === 'mock') {
    return { id: MOCK_CURRENT_USER_ID, email: MOCK_CURRENT_USER_EMAIL }
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    throw new ApiRouteError(401, '인증이 필요합니다')
  }

  return user
}
```

- [ ] **Step 6: `GET /api/account` 구현**

`src/app/api/account/route.ts` 상단 import에 추가:

```ts
import { getProfileService } from '@/services'
import type { AccountSummary } from '@/types'
```

그리고 기존 import 라인의 `withErrorBoundary` 옆에 `resolveCurrentUser`를 추가:

```ts
import { ApiRouteError, resolveCurrentUser, withErrorBoundary } from '../_lib/server'
```

파일에 `GET` 핸들러 추가(기존 `DELETE`는 그대로):

```ts
export async function GET(): Promise<Response> {
  return withErrorBoundary(async () => {
    const { id, email } = await resolveCurrentUser()
    const { plan } = await getProfileService()(id)
    return NextResponse.json({ email, plan } satisfies AccountSummary)
  })
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npx vitest run src/app/api/account/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 8: 커밋**

```bash
git add src/types/plan.ts src/lib/auth/session.ts src/app/api/_lib/server.ts src/app/api/account/route.ts src/app/api/account/route.test.ts
git commit -m "feat(account): GET /api/account 계정 요약(email·plan) 라우트"
```

---

### Task 2: 구독 관리 API — `POST /api/portal`

**Files:**
- Create: `src/app/api/portal/route.ts`
- Test: `src/app/api/portal/route.test.ts`

**Interfaces:**
- Produces: `POST`(`/api/portal`) → `200 { url: string }` | `401 { message }` | `400 { message }`
- Consumes: `resolveCurrentUserId()` (from `@/app/api/_lib/server`), `getProfileService()` (from `@/services`), `getPolarClient()` (from `@/lib/polar/client`) — `.customerSessions.create({ customerId }) → { customerPortalUrl }`.

- [ ] **Step 1: 실패 테스트 작성**

`src/app/api/portal/route.test.ts` 생성:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  getPolarClient: vi.fn(),
  getProfile: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}))
vi.mock('@/lib/polar/client', () => ({ getPolarClient: mocks.getPolarClient }))
vi.mock('@/services', () => ({ getProfileService: () => mocks.getProfile }))

import { POST } from './route'

describe('POST /api/portal', () => {
  const createSession = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('DATA_SOURCE', 'live')
    mocks.getAuthenticatedUserId.mockResolvedValue('user-1')
    mocks.getPolarClient.mockReturnValue({
      customerSessions: { create: createSession },
    })
    mocks.getProfile.mockResolvedValue({
      id: 'user-1',
      plan: 'pro',
      polarCustomerId: 'customer-1',
      polarSubscriptionId: 'sub-1',
    })
    createSession.mockResolvedValue({
      customerPortalUrl: 'https://polar.sh/portal/session-1',
    })
  })

  it('rejects an unauthenticated request before accessing Polar', async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ message: '인증이 필요합니다' })
    expect(mocks.getPolarClient).not.toHaveBeenCalled()
  })

  it('returns 400 when the profile has no Polar customer id', async () => {
    mocks.getProfile.mockResolvedValue({
      id: 'user-1',
      plan: 'free',
      polarCustomerId: null,
      polarSubscriptionId: null,
    })

    const response = await POST()

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      message: '연결된 구독 정보를 찾을 수 없습니다',
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('creates a customer portal session for the linked customer', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: 'https://polar.sh/portal/session-1',
    })
    expect(createSession).toHaveBeenCalledWith({ customerId: 'customer-1' })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/app/api/portal/route.test.ts`
Expected: FAIL — 모듈/`POST` 없음.

- [ ] **Step 3: 라우트 구현**

`src/app/api/portal/route.ts` 생성:

```ts
import { NextResponse } from 'next/server'

import { getPolarClient } from '@/lib/polar/client'
import { getProfileService } from '@/services'

import { ApiRouteError, resolveCurrentUserId, withErrorBoundary } from '../_lib/server'

export async function POST(): Promise<Response> {
  return withErrorBoundary(async () => {
    const userId = await resolveCurrentUserId()
    const profile = await getProfileService()(userId)

    if (!profile.polarCustomerId) {
      throw new ApiRouteError(400, '연결된 구독 정보를 찾을 수 없습니다')
    }

    const session = await getPolarClient().customerSessions.create({
      customerId: profile.polarCustomerId,
    })

    return NextResponse.json({ url: session.customerPortalUrl })
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/app/api/portal/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/portal/route.ts src/app/api/portal/route.test.ts
git commit -m "feat(portal): POST /api/portal Polar 고객 포털 세션 라우트"
```

---

### Task 3: 브라우저 supabase 클라이언트 + `useAccount` 훅

**Files:**
- Create: `src/lib/supabase/browser-client.ts`
- Create: `src/queries/account/index.ts`
- Test: `src/queries/account/index.test.ts`

**Interfaces:**
- Produces:
  - `createSupabaseBrowserClient(): SupabaseClient` (from `@/lib/supabase/browser-client`)
  - `accountKeys.current = ['account']`, `useAccount()` → `{ account?: AccountSummary; isUnauthenticated: boolean; queryState; ...query }` (from `@/queries/account`)
- Consumes: `apiClient.get<AccountSummary>('/api/account')`, `ApiError`, `queryState`.

- [ ] **Step 1: 브라우저 클라이언트 헬퍼 작성**

`src/lib/supabase/browser-client.ts` 생성(LoginClient의 인라인 생성 패턴을 헬퍼로 승격):

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createSupabaseBrowserClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 2: 실패 테스트 작성**

`src/queries/account/index.test.ts` 생성:

```ts
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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
  await act(async () => { await Promise.resolve() })
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/queries/account/index.test.ts`
Expected: FAIL — `./index` 없음.

- [ ] **Step 4: `useAccount` 구현**

`src/queries/account/index.ts` 생성:

```ts
'use client'

import { useQuery } from '@tanstack/react-query'

import { ApiError, apiClient } from '@/lib/apiClient'
import type { AccountSummary } from '@/types'

import { queryState } from '../queryState'

export const accountKeys = {
  current: ['account'] as const,
}

export function useAccount() {
  const query = useQuery({
    queryKey: accountKeys.current,
    queryFn: () => apiClient.get<AccountSummary>('/api/account'),
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 401 ? false : failureCount < 2,
  })

  const isUnauthenticated =
    query.error instanceof ApiError && query.error.status === 401

  return {
    ...query,
    account: query.data,
    isUnauthenticated,
    queryState: queryState(query.isPending, query.error, query.data === undefined),
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/queries/account/index.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/supabase/browser-client.ts src/queries/account/index.ts src/queries/account/index.test.ts
git commit -m "feat(account): 브라우저 supabase 클라이언트 헬퍼 + useAccount 훅"
```

---

### Task 4: `AppShell` 사이드바 셸 컴포넌트

**Files:**
- Create: `src/components/ui/AppShell.tsx`
- Modify: `src/components/ui/index.ts` (`export * from './AppShell'`)
- Test: `src/components/ui/AppShell.test.tsx`

**Interfaces:**
- Produces: `AppShell({ children }: { children: ReactNode })` (from `@/components/ui`) — 좌측 사이드바(데스크톱)+드로어(모바일) 셸.
- Consumes: `useAccount()` (Task 3), `createSupabaseBrowserClient()` (Task 3), `apiClient.post<{ url: string }>('/api/portal', {})`, `Badge`/`ThemeToggle`/`Wordmark`(기존), `usePathname`/`useRouter`(next/navigation).

- [ ] **Step 1: 실패 테스트 작성**

`src/components/ui/AppShell.test.tsx` 생성:

```ts
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
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/ui/AppShell.test.tsx`
Expected: FAIL — `./AppShell` 없음.

- [ ] **Step 3: `AppShell` 구현**

`src/components/ui/AppShell.tsx` 생성:

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { apiClient } from '@/lib/apiClient'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { useAccount } from '@/queries/account'

import { Badge } from './Badge'
import { Wordmark } from './layout'
import { cn } from './styles'
import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/upload', label: '파일 업로드' },
  { href: '/pro', label: 'Pro 리포트' },
] as const

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="주요 메뉴" className="flex flex-col gap-xxs">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'rounded-md px-md py-sm text-nav font-nav',
              active ? 'bg-surface-strong text-ink' : 'text-body hover:bg-surface-soft hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function AccountBlock() {
  const router = useRouter()
  const { account, isUnauthenticated } = useAccount()
  const [busy, setBusy] = useState(false)

  const logout = async () => {
    setBusy(true)
    try {
      await createSupabaseBrowserClient().auth.signOut()
      router.push('/login')
    } finally {
      setBusy(false)
    }
  }

  const manageSubscription = async () => {
    setBusy(true)
    try {
      const { url } = await apiClient.post<{ url: string }>('/api/portal', {})
      window.location.href = url
    } finally {
      setBusy(false)
    }
  }

  if (isUnauthenticated) {
    return (
      <div className="border-t border-hairline pt-md">
        <Link
          href="/login"
          className="block rounded-md px-md py-sm text-nav font-nav text-primary hover:bg-surface-soft"
        >
          로그인
        </Link>
      </div>
    )
  }

  if (!account) {
    return <div className="border-t border-hairline pt-md text-caption text-muted">불러오는 중…</div>
  }

  return (
    <div className="space-y-sm border-t border-hairline pt-md">
      <div className="flex items-center justify-between gap-sm">
        <span className="truncate text-body-sm text-body" title={account.email ?? undefined}>
          {account.email ?? '계정'}
        </span>
        <Badge variant={account.plan === 'pro' ? 'pro' : 'neutral'}>
          {account.plan === 'pro' ? 'Pro' : 'Free'}
        </Badge>
      </div>

      {account.plan === 'pro' ? (
        <button
          type="button"
          onClick={manageSubscription}
          disabled={busy}
          className="w-full rounded-md px-md py-sm text-left text-body-sm text-body hover:bg-surface-soft disabled:opacity-60"
        >
          구독 관리
        </button>
      ) : (
        <Link
          href="/pro"
          className="block rounded-pill bg-primary px-md py-sm text-center text-button font-button text-on-primary hover:bg-primary-active"
        >
          Pro로 업그레이드
        </Link>
      )}

      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="w-full rounded-md px-md py-sm text-left text-body-sm text-muted hover:bg-surface-soft hover:text-ink disabled:opacity-60"
      >
        로그아웃
      </button>
    </div>
  )
}

function SidebarBody({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-lg p-lg">
      <Link href="/dashboard" aria-label="핀사이트 대시보드" onClick={onNavigate}>
        <Wordmark />
      </Link>
      <NavLinks pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto space-y-md">
        <ThemeToggle />
        <AccountBlock />
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-dvh lg:flex">
      {/* 데스크톱 고정 사이드바 */}
      <aside className="hidden w-64 shrink-0 border-r border-hairline bg-canvas lg:sticky lg:top-0 lg:block lg:h-dvh">
        <SidebarBody pathname={pathname} />
      </aside>

      {/* 모바일 상단바 */}
      <header className="flex min-h-14 items-center gap-sm border-b border-hairline bg-canvas px-md lg:hidden">
        <button
          type="button"
          aria-label="메뉴 열기"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-xs text-body hover:bg-surface-soft"
        >
          <span aria-hidden="true">☰</span>
        </button>
        <Link href="/dashboard" aria-label="핀사이트 대시보드"><Wordmark /></Link>
        <div className="ml-auto"><ThemeToggle /></div>
      </header>

      {/* 모바일 드로어 */}
      {drawerOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-surface-dark/30 lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="fs-slide fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto border-r border-hairline bg-canvas lg:hidden">
            <SidebarBody pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </>
      ) : null}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: index.ts에 export 추가**

`src/components/ui/index.ts`의 alphabetical 위치(`export * from './Amount'` 다음)에 추가:

```ts
export * from './AppShell'
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/components/ui/AppShell.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/components/ui/AppShell.tsx src/components/ui/index.ts src/components/ui/AppShell.test.tsx
git commit -m "feat(ui): AppShell 사이드바 셸(계정·구독상태·로그아웃·모바일 드로어)"
```

---

### Task 5: 인증 앱 페이지에 AppShell 적용 + 회귀 검증

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/upload/page.tsx`
- Modify: `src/app/upload/mapping/page.tsx`
- Modify: `src/app/pro/page.tsx`

**Interfaces:**
- Consumes: `AppShell` (from `@/components/ui`).
- 랜딩 `/`·`/login`은 변경하지 않는다(마케팅/공개 페이지, `TopNav` 유지).

- [ ] **Step 1: dashboard 페이지 교체**

`src/app/dashboard/page.tsx`에서 `TopNav`를 `AppShell`로 교체. 현재:

```tsx
import { TopNav } from '@/components/ui'
```
→
```tsx
import { AppShell } from '@/components/ui'
```

그리고 렌더에서 `<TopNav />` + 페이지 본문을 `<AppShell>…children…</AppShell>`로 감싼다. 예:

```tsx
return (
  <AppShell>
    <DashboardClient />
  </AppShell>
)
```

(현재 `page.tsx`의 실제 자식 구조에 맞춰 `<TopNav />`를 제거하고 기존 본문을 `AppShell`의 children으로 넣는다.)

- [ ] **Step 2: upload 페이지 교체**

`src/app/upload/page.tsx`:
```tsx
import { AppShell } from '@/components/ui'
export default function Page() {
  return <AppShell><UploadClient /></AppShell>
}
```

- [ ] **Step 3: upload/mapping 페이지 교체**

`src/app/upload/mapping/page.tsx`의 `TopNav`를 동일하게 `AppShell`로 감싸도록 교체(기존 자식·props 유지).

- [ ] **Step 4: pro 페이지 교체**

`src/app/pro/page.tsx`. 현재:
```tsx
import { TopNav } from '@/components/ui'
export default async function Page({ searchParams }: …) {
  const params = …
  return <><TopNav /><ProReportClient guest={params.guest === '1'} /></>
}
```
→
```tsx
import { AppShell } from '@/components/ui'
…
  return <AppShell><ProReportClient guest={params.guest === '1'} /></AppShell>
```

- [ ] **Step 5: 타입체크 + 전체 테스트 + 린트**

Run:
```bash
npx tsc --noEmit
npm run test
npm run lint
```
Expected: 타입 통과, 전체 테스트 PASS(신규 포함), lint 클린.

- [ ] **Step 6: 스모크(에셋 404·5xx 게이트)**

Run: `npm run smoke`
Expected: exit 0 — 페이지·API 5xx 없음, 홈 참조 CSS/JS 404 없음.

- [ ] **Step 7: 브라우저 수동 확인(선택)**

`docs/BROWSER_TESTING.md`의 UC 참조. 데스크톱 사이드바 노출, 모바일 폭에서 햄버거→드로어, Pro 계정에서 배지 'Pro'+'구독 관리', free에서 '업그레이드' CTA, 로그아웃 후 `/login` 이동 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/app/dashboard/page.tsx src/app/upload/page.tsx src/app/upload/mapping/page.tsx src/app/pro/page.tsx
git commit -m "feat(ui): 인증 앱 페이지 헤더를 AppShell 사이드바로 교체"
```

---

## Self-Review

**Spec coverage:**
- 좌측 사이드바 셸 → Task 4/5 ✓
- 로그인 계정(email) 표시 → Task 1(API)+3(hook)+4(UI) ✓
- 구독 상태(Pro/free) 배지 → Task 1(plan)+4(Badge) ✓
- 로그아웃 → Task 3(browser client)+4(AppShell) ✓
- free 업그레이드 CTA → Task 4 ✓
- Pro 구독 관리(Polar 포털) → Task 2(API)+4(UI) ✓
- 테마 토글 사이드바 이동 → Task 4(SidebarBody/모바일바) ✓
- 모바일 드로어 → Task 4 ✓
- 대상 페이지만 적용, 랜딩/로그인 제외 → Task 5 ✓
- 미로그인 graceful(로그인 링크) → Task 3(isUnauthenticated)+4 ✓

**Placeholder scan:** 모든 스텝에 실제 코드/명령 포함. "TBD"·"적절히 처리" 없음.

**Type consistency:** `AccountSummary { email: string | null; plan: Plan }`가 Task1(생성)→Task3(useAccount)→Task4(소비) 일관. `resolveCurrentUser`(id+email) vs `resolveCurrentUserId`(id) 용도 구분 명확. `customerSessions.create({ customerId }) → { customerPortalUrl }`가 Task2에서 `{ url }`로 매핑됨(테스트와 일치).

**주의(구현자):** 스펙에는 AppShell을 `layout.tsx`에 둔다고 적었으나, `layout.tsx`는 서버 컴포넌트(TopNav/Footer)라 파일 전체를 `'use client'`로 만들지 않기 위해 **별도 파일 `AppShell.tsx`**로 분리한다(Wordmark는 `./layout`에서 import). 기능/범위는 동일.
