# PostHog 계측·에러 트래킹·로깅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** finsight에 PostHog 제품 분석(활성화 퍼널 + 사용자 식별), 클라이언트/서버 예외 캡처, 서버 로깅 라우팅을 처음부터 구축한다.

**Architecture:** 클라이언트는 `instrumentation-client.ts`에서 posthog-js를 초기화(자동 페이지뷰·자동캡처·예외 캡처)하고, `lib/analytics/client.ts` 헬퍼로 커스텀 이벤트를 캡처한다. 서버는 `lib/analytics/server.ts`(posthog-node)로 이벤트/예외를 캡처하며, 모든 API 예외의 단일 관문인 `withErrorBoundary`와 서버 로거를 통해 라우팅한다. distinct_id는 클라이언트·서버 모두 Supabase `user.id`로 통일한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, posthog-js, posthog-node, Supabase(@supabase/ssr), vitest(jsdom).

**Spec:** `docs/superpowers/specs/2026-08-15-posthog-instrumentation-design.md`

## Global Constraints

- distinct_id는 항상 Supabase `user.id`를 사용한다. 이메일/표시명/공유 리터럴 금지.
- PostHog init/capture는 `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`이 있을 때만 동작한다(토큰 없으면 조용히 no-op).
- 서버측 posthog-node는 항상 `flushAt: 1`, `flushInterval: 0`으로 생성하고 캡처 후 `await shutdown()`한다.
- 예상된 오류(`ApiRouteError`, 4xx)는 예외로 캡처하지 않는다. 예기치 못한 오류(500)만 캡처한다.
- 이벤트명은 반드시 `lib/analytics/events.ts`의 `ANALYTICS_EVENTS` 상수를 통해 사용한다(문자열 리터럴 금지).
- init 옵션은 `defaults: '2026-05-30'`를 사용한다.
- 기존 finsight 코드 스타일을 따른다(named export, 세미콜론 없음은 아님 — 이 레포는 세미콜론 없이 작성, 파일 확인).

---

### Task 1: 의존성·환경변수·초기화

**Files:**
- Modify: `package.json` (deps: `posthog-js`, `posthog-node`)
- Modify: `.env.local`, `.env.example`
- Create: `instrumentation-client.ts` (레포 루트)
- Modify: `src/lib/env.ts` (getter 추가)
- Test: `src/lib/env.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Produces: `getPosthogToken(): string | null`, `getPosthogHost(): string` (서버측 env 접근)

- [ ] **Step 1: 의존성 설치**

```bash
cd /Users/byeon-inseob/Projects/finsight
npm install --save posthog-js posthog-node
```

- [ ] **Step 2: 환경변수 추가**

`.env.local`과 `.env.example`에 아래 두 줄 추가(값은 준비된 프로젝트 토큰; `.env.example`은 플레이스홀더):

```shell
# .env.local
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_oDYzbgDffzstokYDNaYjEt9GuSKRSCL4MW92d2hoK5yX
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

```shell
# .env.example
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_your_project_token
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

- [ ] **Step 3: env getter 테스트 작성(실패 확인)**

`src/lib/env.test.ts`에 추가:

```ts
import { getPosthogHost, getPosthogToken } from './env'

describe('posthog env', () => {
  const original = { ...process.env }
  afterEach(() => { process.env = { ...original } })

  it('returns token when set', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    expect(getPosthogToken()).toBe('phc_test')
  })

  it('returns null when token is missing', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    expect(getPosthogToken()).toBeNull()
  })

  it('defaults host to us cloud', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    expect(getPosthogHost()).toBe('https://us.i.posthog.com')
  })
})
```

Run: `npm run test -- src/lib/env.test.ts`
Expected: FAIL (getPosthogToken/getPosthogHost 미정의)

- [ ] **Step 4: env getter 구현**

`src/lib/env.ts` 하단에 추가:

```ts
export function getPosthogToken(): string | null {
  return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? null
}

export function getPosthogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
}
```

- [ ] **Step 5: instrumentation-client.ts 작성**

레포 루트에 `instrumentation-client.ts` 생성:

```ts
import posthog from 'posthog-js'

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

if (token) {
  posthog.init(token, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    defaults: '2026-05-30',
    capture_exceptions: true,
  })
}
```

- [ ] **Step 6: CSP 확인**

`next.config.ts`와 `src/middleware.ts`에 Content-Security-Policy 헤더가 있는지 확인:

Run: `grep -rn "Content-Security-Policy\|contentSecurityPolicy\|script-src" next.config.ts src/middleware.ts`
- 결과가 있으면: `script-src`/`connect-src`에 `https://*.posthog.com`, `worker-src 'self' blob: data:` 추가.
- 결과가 없으면: 조치 불필요(주석으로 확인 사실만 남기지 않음).

- [ ] **Step 7: 테스트·빌드 확인**

Run: `npm run test -- src/lib/env.test.ts && npm run build`
Expected: PASS, 빌드 성공(instrumentation-client 인식)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example instrumentation-client.ts src/lib/env.ts src/lib/env.test.ts
git commit -m "feat(analytics): PostHog 의존성·초기화·env getter 추가"
```

---

### Task 2: 이벤트 taxonomy (`events.ts`)

**Files:**
- Create: `src/lib/analytics/events.ts`
- Test: `src/lib/analytics/events.test.ts`

**Interfaces:**
- Produces: `ANALYTICS_EVENTS` (상수 맵), `type AnalyticsEvent` (유니온 문자열)

- [ ] **Step 1: 테스트 작성(실패 확인)**

`src/lib/analytics/events.test.ts`:

```ts
import { ANALYTICS_EVENTS } from './events'

it('exposes stable funnel event names', () => {
  expect(ANALYTICS_EVENTS.loginStarted).toBe('login_started')
  expect(ANALYTICS_EVENTS.proActivated).toBe('pro_activated')
  expect(ANALYTICS_EVENTS.dashboardViewed).toBe('dashboard_viewed')
})

it('has no duplicate event values', () => {
  const values = Object.values(ANALYTICS_EVENTS)
  expect(new Set(values).size).toBe(values.length)
})
```

Run: `npm run test -- src/lib/analytics/events.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 2: 구현**

`src/lib/analytics/events.ts`:

```ts
export const ANALYTICS_EVENTS = {
  loginStarted: 'login_started',
  signedIn: 'signed_in',
  uploadStarted: 'upload_started',
  uploadCompleted: 'upload_completed',
  mappingCompleted: 'mapping_completed',
  transactionsSaved: 'transactions_saved',
  dashboardViewed: 'dashboard_viewed',
  proCheckoutStarted: 'pro_checkout_started',
  proActivated: 'pro_activated',
  proReportGenerated: 'pro_report_generated',
  proInsightsDegraded: 'pro_insights_degraded',
  accountDeleted: 'account_deleted',
} as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm run test -- src/lib/analytics/events.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/events.ts src/lib/analytics/events.test.ts
git commit -m "feat(analytics): 이벤트 taxonomy 상수 추가"
```

---

### Task 3: 클라이언트 캡처 헬퍼 (`client.ts`)

**Files:**
- Create: `src/lib/analytics/client.ts`
- Test: `src/lib/analytics/client.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent` (Task 2)
- Produces:
  - `captureEvent(event: AnalyticsEvent, properties?: Record<string, unknown>): void`
  - `identifyUser(distinctId: string, properties?: Record<string, unknown>): void`
  - `resetUser(): void`
  - `setUserProperties(properties: Record<string, unknown>): void`

- [ ] **Step 1: 테스트 작성(실패 확인)**

`src/lib/analytics/client.test.ts`:

```ts
import { vi } from 'vitest'

const posthogMock = {
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  setPersonProperties: vi.fn(),
}
vi.mock('posthog-js', () => ({ default: posthogMock }))

import { captureEvent, identifyUser, resetUser, setUserProperties } from './client'
import { ANALYTICS_EVENTS } from './events'

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
```

Run: `npm run test -- src/lib/analytics/client.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 2: 구현**

`src/lib/analytics/client.ts`:

```ts
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
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm run test -- src/lib/analytics/client.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/client.ts src/lib/analytics/client.test.ts
git commit -m "feat(analytics): 클라이언트 캡처/식별 헬퍼 추가"
```

---

### Task 4: 서버 캡처 헬퍼 (`server.ts`)

**Files:**
- Create: `src/lib/analytics/server.ts`
- Test: `src/lib/analytics/server.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent` (Task 2), `getPosthogToken`/`getPosthogHost` (Task 1)
- Produces:
  - `captureServerEvent(distinctId: string, event: AnalyticsEvent, properties?: Record<string, unknown>): Promise<void>`
  - `captureServerException(error: unknown, context?: { distinctId?: string; route?: string; method?: string }): Promise<void>`

- [ ] **Step 1: 테스트 작성(실패 확인)**

`src/lib/analytics/server.test.ts`:

```ts
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
```

Run: `npm run test -- src/lib/analytics/server.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 2: 구현**

`src/lib/analytics/server.ts`:

```ts
import { PostHog } from 'posthog-node'

import { getPosthogHost, getPosthogToken } from '../env'
import type { AnalyticsEvent } from './events'

function createClient(): PostHog | null {
  const token = getPosthogToken()
  if (!token) return null
  return new PostHog(token, { host: getPosthogHost(), flushAt: 1, flushInterval: 0 })
}

export async function captureServerEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): Promise<void> {
  const client = createClient()
  if (!client) return
  client.capture({ distinctId, event, properties })
  await client.shutdown()
}

export async function captureServerException(
  error: unknown,
  context?: { distinctId?: string; route?: string; method?: string },
): Promise<void> {
  const client = createClient()
  if (!client) return
  const { distinctId, ...rest } = context ?? {}
  client.captureException(error, distinctId, rest)
  await client.shutdown()
}
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm run test -- src/lib/analytics/server.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/server.ts src/lib/analytics/server.test.ts
git commit -m "feat(analytics): 서버 이벤트/예외 캡처 헬퍼 추가"
```

---

### Task 5: 서버 로거 (`logger.ts`)

**Files:**
- Create: `src/lib/observability/logger.ts`
- Test: `src/lib/observability/logger.test.ts`

**Interfaces:**
- Consumes: `captureServerException` (Task 4)
- Produces:
  - `logError(message: string, context?: { error?: unknown; distinctId?: string; route?: string; method?: string }): Promise<void>`
  - `logWarn(message: string, context?: Record<string, unknown>): void`

- [ ] **Step 1: 테스트 작성(실패 확인)**

`src/lib/observability/logger.test.ts`:

```ts
import { vi } from 'vitest'

const captureServerException = vi.fn().mockResolvedValue(undefined)
vi.mock('../analytics/server', () => ({ captureServerException }))

import { logError, logWarn } from './logger'

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
```

Run: `npm run test -- src/lib/observability/logger.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 2: 구현**

`src/lib/observability/logger.ts`:

```ts
import { captureServerException } from '../analytics/server'

export async function logError(
  message: string,
  context?: { error?: unknown; distinctId?: string; route?: string; method?: string },
): Promise<void> {
  const { error, distinctId, route, method } = context ?? {}
  console.error(message, error)
  await captureServerException(error ?? new Error(message), { distinctId, route, method })
}

export function logWarn(message: string, context?: Record<string, unknown>): void {
  console.warn(message, context)
}
```

> 참고: 스펙 §6은 warn을 이벤트로 라우팅하는 것을 언급하나, 노이즈를 줄이기 위해 이번 구현에서는 `logWarn`을 console 전용으로 둔다(추후 필요 시 이벤트화).

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm run test -- src/lib/observability/logger.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/observability/logger.ts src/lib/observability/logger.test.ts
git commit -m "feat(observability): console+PostHog 서버 로거 추가"
```

---

### Task 6: 사용자 식별 컴포넌트 + Providers 연결

**Files:**
- Create: `src/components/analytics/PostHogUserSync.tsx`
- Modify: `src/app/providers.tsx`
- Test: `src/components/analytics/PostHogUserSync.test.tsx`

**Interfaces:**
- Consumes: `identifyUser`, `resetUser`, `captureEvent` (Task 3), `ANALYTICS_EVENTS` (Task 2), `createSupabaseBrowserClient` (`src/lib/supabase/browser-client.ts`)
- Produces: `PostHogUserSync(): null` (React 컴포넌트)

- [ ] **Step 1: 테스트 작성(실패 확인)**

`src/components/analytics/PostHogUserSync.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const identifyUser = vi.fn()
const resetUser = vi.fn()
const captureEvent = vi.fn()
vi.mock('@/lib/analytics/client', () => ({ identifyUser, resetUser, captureEvent }))

let authCallback: (event: string, session: unknown) => void = () => {}
const getUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1', email: 'a@b.com', app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' } },
})
const onAuthStateChange = vi.fn((cb) => {
  authCallback = cb
  return { data: { subscription: { unsubscribe: vi.fn() } } }
})
vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { getUser, onAuthStateChange } }),
}))

import { PostHogUserSync } from './PostHogUserSync'

beforeEach(() => vi.clearAllMocks())

it('identifies the current user on mount', async () => {
  render(<PostHogUserSync />)
  await waitFor(() => {
    expect(identifyUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      email: 'a@b.com',
      auth_provider: 'google',
    }))
  })
})

it('resets on sign out', async () => {
  render(<PostHogUserSync />)
  await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled())
  authCallback('SIGNED_OUT', null)
  expect(resetUser).toHaveBeenCalled()
})
```

> 참고: `@testing-library/react`가 devDependency에 없으면 설치: `npm install --save-dev @testing-library/react`. (기존 컴포넌트 테스트가 다른 방식이면 그 방식을 따를 것 — 먼저 `src/components/ui/AppShell.test.tsx`의 렌더 방식을 확인.)

Run: `npm run test -- src/components/analytics/PostHogUserSync.test.tsx`
Expected: FAIL (모듈 없음)

- [ ] **Step 2: 구현**

`src/components/analytics/PostHogUserSync.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

import { captureEvent, identifyUser, resetUser } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'

export function PostHogUserSync(): null {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    const identify = (user: {
      id: string
      email?: string | null
      app_metadata?: { provider?: string }
      created_at?: string
    }) => {
      identifyUser(user.id, {
        email: user.email ?? undefined,
        auth_provider: user.app_metadata?.provider,
        signup_at: user.created_at,
      })
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) identify(data.user)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        identify(session.user)
        captureEvent(ANALYTICS_EVENTS.signedIn, { auth_provider: session.user.app_metadata?.provider })
      }
      if (event === 'SIGNED_OUT') {
        resetUser()
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return null
}
```

- [ ] **Step 3: Providers에 연결**

`src/app/providers.tsx`를 수정해 `<PostHogUserSync />`를 트리에 마운트:

```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { PostHogUserSync } from '@/components/analytics/PostHogUserSync'

type ProvidersProps = Readonly<{
  children: React.ReactNode
}>

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <PostHogUserSync />
      {children}
    </QueryClientProvider>
  )
}
```

- [ ] **Step 4: 테스트·빌드 확인**

Run: `npm run test -- src/components/analytics/PostHogUserSync.test.tsx && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/PostHogUserSync.tsx src/components/analytics/PostHogUserSync.test.tsx src/app/providers.tsx
git commit -m "feat(analytics): 로그인 시 identify/로그아웃 시 reset 동기화"
```

---

### Task 7: 클라이언트 에러 바운더리

**Files:**
- Create: `src/app/error.tsx`
- Create: `src/app/global-error.tsx`
- Test: `src/app/error.test.tsx`

**Interfaces:**
- Consumes: `posthog-js` (captureException)

- [ ] **Step 1: 테스트 작성(실패 확인)**

`src/app/error.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

const captureException = vi.fn()
vi.mock('posthog-js', () => ({ default: { captureException } }))

import Error from './error'

it('captures the error and renders a fallback', () => {
  const error = Object.assign(new Error('boom'), { digest: 'abc' })
  render(<Error error={error} reset={vi.fn()} />)
  expect(captureException).toHaveBeenCalledWith(error)
  expect(screen.getByRole('alert')).toBeTruthy()
})
```

Run: `npm run test -- src/app/error.test.tsx`
Expected: FAIL (모듈 없음)

- [ ] **Step 2: `error.tsx` 구현**

`src/app/error.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])

  return (
    <main className="mx-auto max-w-container px-lg py-xxl text-left">
      <p role="alert" className="text-body-sm text-semantic-down">
        일시적인 오류가 발생했습니다.
      </p>
      <button type="button" onClick={reset} className="mt-base text-body-sm text-primary">
        다시 시도
      </button>
    </main>
  )
}
```

- [ ] **Step 3: `global-error.tsx` 구현**

`src/app/global-error.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])

  return (
    <html lang="ko">
      <body>
        <main className="mx-auto max-w-container px-lg py-xxl text-left">
          <p role="alert" className="text-body-sm text-semantic-down">
            일시적인 오류가 발생했습니다.
          </p>
          <button type="button" onClick={reset} className="mt-base text-body-sm text-primary">
            다시 시도
          </button>
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- src/app/error.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/error.tsx src/app/global-error.tsx src/app/error.test.tsx
git commit -m "feat(error-tracking): 클라이언트 에러 바운더리 예외 캡처 추가"
```

---

### Task 8: 서버 예외 캡처 (`withErrorBoundary`)

**Files:**
- Modify: `src/app/api/_lib/server.ts:196-210` (`withErrorBoundary`)
- Test: `src/app/api/_lib/server.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `captureServerException` (Task 4)

- [ ] **Step 1: 테스트 작성(실패 확인)**

`src/app/api/_lib/server.test.ts`에 추가(기존 상단 import 스타일에 맞춰 mock 배치):

```ts
import { vi } from 'vitest'
const captureServerException = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/analytics/server', () => ({ captureServerException }))

import { ApiRouteError, withErrorBoundary } from './server'

describe('withErrorBoundary exception capture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not capture expected ApiRouteError', async () => {
    await withErrorBoundary(async () => { throw new ApiRouteError(400, 'bad') })
    expect(captureServerException).not.toHaveBeenCalled()
  })

  it('captures unexpected errors', async () => {
    const error = new Error('boom')
    await withErrorBoundary(async () => { throw error })
    expect(captureServerException).toHaveBeenCalledWith(error)
  })
})
```

Run: `npm run test -- src/app/api/_lib/server.test.ts`
Expected: FAIL (아직 캡처 호출 없음)

- [ ] **Step 2: 구현**

`src/app/api/_lib/server.ts` 상단 import에 추가:

```ts
import { captureServerException } from '@/lib/analytics/server'
```

`withErrorBoundary`의 `console.error(error)` 다음 줄에 캡처 추가(예상 오류 분기 아래, 500 분기 안):

```ts
    console.error(error)
    await captureServerException(error)
    return NextResponse.json(
      { message: INTERNAL_ERROR_MESSAGE },
      { status: 500 },
    )
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm run test -- src/app/api/_lib/server.test.ts`
Expected: PASS (기존 케이스 포함 전부)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/_lib/server.ts src/app/api/_lib/server.test.ts
git commit -m "feat(error-tracking): API 500 예외를 PostHog로 캡처"
```

---

### Task 9: 퍼널 이벤트 — 로그인·업로드·매핑

**Files:**
- Modify: `src/app/login/LoginClient.tsx:19` (`login` 함수 진입)
- Modify: `src/app/upload/UploadClient.tsx:90` (`continueToMapping`), `:96`/`:103` (onSuccess)
- Modify: `src/app/upload/mapping/MappingClient.tsx:92`/`:172` (mutate onSuccess), CSV `confirm`

**Interfaces:**
- Consumes: `captureEvent` (Task 3), `ANALYTICS_EVENTS` (Task 2)

- [ ] **Step 1: LoginClient — `login_started`**

`src/app/login/LoginClient.tsx` import 추가 후, `login` 함수의 `setPending(true)` 다음 줄:

```tsx
import { captureEvent } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
```

```tsx
  const login = async (provider: OAuthProvider) => {
    setPending(true)
    setError(null)
    captureEvent(ANALYTICS_EVENTS.loginStarted, { provider })
```

- [ ] **Step 2: UploadClient — `upload_started` / `upload_completed`**

import 추가 후, `continueToMapping` 시작에 `upload_started`, 각 성공 지점에 `upload_completed`:

```tsx
  const continueToMapping = () => {
    if (!parsed) return
    captureEvent(ANALYTICS_EVENTS.uploadStarted, { file_type: parsed.source })

    if (parsed.source === 'pdf') {
      extractPdf.mutate(
        { fileName: parsed.fileName, dataBase64: parsed.dataBase64 },
        { onSuccess: (transactions) => {
          captureEvent(ANALYTICS_EVENTS.uploadCompleted, { file_type: 'pdf', row_count: transactions.length })
          store({ source: 'pdf', fileName: parsed.fileName, transactions })
        } },
      )
      return
    }

    const openMapping = (mappingResult: ColumnMappingResult) => {
      captureEvent(ANALYTICS_EVENTS.uploadCompleted, { file_type: 'csv', row_count: parsed.rows.length })
      store({ source: 'csv', fileName: parsed.fileName, encoding: parsed.encoding, headers: parsed.headers, rows: parsed.rows, mappingResult })
    }
```

(나머지 `mappingPreview.mutate(...)` 블록은 그대로 두고 `openMapping`만 위처럼 확장.)

- [ ] **Step 3: MappingClient — `mapping_completed` / `transactions_saved`**

import 추가 후:
- CSV `confirm`의 `upload.mutate` 직전에 `mapping_completed`:

```tsx
  const confirm = () => {
    if (!mapping || !canConfirm) return
    const transactions = classifyMany(applyMapping(draft.headers, draft.rows, mapping))
    if (transactions.length === 0) return
    captureEvent(ANALYTICS_EVENTS.mappingCompleted, { source: 'csv', transaction_count: transactions.length })
    upload.mutate({ source: 'csv', fileName: draft.fileName, mapping, transactions }, {
      onSuccess: () => {
        captureEvent(ANALYTICS_EVENTS.transactionsSaved, { source: 'csv', transaction_count: transactions.length })
        sessionStorage.removeItem(UPLOAD_SESSION_KEY)
        onDone()
      },
    })
  }
```

- PDF `PdfReview.confirm`의 onSuccess에 `transactions_saved`:

```tsx
    upload.mutate({ source: 'pdf', fileName: draft.fileName, transactions }, {
      onSuccess: () => {
        captureEvent(ANALYTICS_EVENTS.transactionsSaved, { source: 'pdf', transaction_count: transactions.length })
        sessionStorage.removeItem(UPLOAD_SESSION_KEY)
        onDone()
      },
    })
```

- [ ] **Step 4: 회귀 확인**

Run: `npm run test && npm run lint`
Expected: PASS (기존 테스트 회귀 없음)

> 이 세 컴포넌트는 무거운 UI라 새 단위 테스트를 강제하지 않는다. 계측은 Task 12의 수동 검증(PostHog 활동 피드)에서 확인한다.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/LoginClient.tsx src/app/upload/UploadClient.tsx src/app/upload/mapping/MappingClient.tsx
git commit -m "feat(analytics): 로그인·업로드·매핑 퍼널 이벤트 계측"
```

---

### Task 10: 퍼널 이벤트 — 대시보드·Pro

**Files:**
- Modify: `src/app/dashboard/DashboardClient.tsx` (성공 렌더 시 `dashboard_viewed`)
- Modify: `src/app/pro/ProReportClient.tsx` (`startCheckout` → `pro_checkout_started`; report 성공 → `pro_report_generated`; `aiDegraded` → `pro_insights_degraded`)

**Interfaces:**
- Consumes: `captureEvent`, `setUserProperties` (Task 3), `ANALYTICS_EVENTS` (Task 2)

- [ ] **Step 1: DashboardClient — `dashboard_viewed` + plan 속성**

import 추가:

```tsx
import { useEffect } from 'react'
import { captureEvent, setUserProperties } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
```

훅 순서를 지키기 위해 조기 return 위(예: `netBalance` 계산 근처, 다른 훅들과 함께) 에 useEffect 추가. `queryState.status`가 바뀔 때만 발화:

```tsx
  useEffect(() => {
    if (queryState.status !== 'success') return
    captureEvent(ANALYTICS_EVENTS.dashboardViewed, {
      is_guest: guest,
      period,
      transaction_count: transactions.length,
    })
  }, [queryState.status, guest, period, transactions.length])

  useEffect(() => {
    if (profile?.plan) setUserProperties({ plan: profile.plan })
  }, [profile?.plan])
```

> 주의: 두 useEffect는 반드시 컴포넌트의 다른 훅들과 함께 조기 return 문들보다 **위**에 위치해야 한다(React 훅 규칙). `queryState`/`profile`은 이미 상단에서 구조분해되어 있으므로 그 아래에 배치.

- [ ] **Step 2: ProReportClient — checkout/report/degraded**

import 추가 후:
- `startCheckout`의 `setCheckoutPending(true)` 다음에:

```tsx
    setCheckoutPending(true)
    setCheckoutError(null)
    captureEvent(ANALYTICS_EVENTS.proCheckoutStarted)
```

- report 성공/degraded 발화용 useEffect(다른 훅들과 함께, 조기 return 위):

```tsx
  useEffect(() => {
    if (reportState.status !== 'success' || !report) return
    captureEvent(ANALYTICS_EVENTS.proReportGenerated, { period })
    if (report.aiDegraded) {
      captureEvent(ANALYTICS_EVENTS.proInsightsDegraded, { period })
    }
  }, [reportState.status, report, period])
```

`useEffect`가 import되어 있지 않으면 `import { useEffect, useMemo, useState } from 'react'`로 확장.

- [ ] **Step 3: 회귀 확인**

Run: `npm run test && npm run lint`
Expected: PASS (기존 `ProReportClient.test.tsx` 포함)

> `ProReportClient.test.tsx`가 posthog-js를 직접/간접 import하게 되면 mock이 필요할 수 있다. 실패 시 테스트 상단에 `vi.mock('@/lib/analytics/client', () => ({ captureEvent: vi.fn(), setUserProperties: vi.fn() }))` 추가.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/DashboardClient.tsx src/app/pro/ProReportClient.tsx
git commit -m "feat(analytics): 대시보드·Pro 퍼널 이벤트 계측"
```

---

### Task 11: 서버 이벤트 — Pro 활성화·계정 삭제·실패 로깅

**Files:**
- Modify: `src/app/api/webhooks/polar/route.ts:94-113` (`activatePlan` 성공 후 `pro_activated`)
- Modify: `src/app/api/account/route.ts:74` (삭제 실패 로깅), 삭제 성공 지점 (`account_deleted`)
- Modify: `src/app/auth/callback/route.ts:27,44,53` (실패를 logger로 라우팅)
- Modify: `src/app/api/uploads/route.ts:101,105` (실패를 logger로 라우팅)

**Interfaces:**
- Consumes: `captureServerEvent` (Task 4), `logError` (Task 5), `ANALYTICS_EVENTS` (Task 2)

- [ ] **Step 1: polar 웹훅 — `pro_activated`**

`src/app/api/webhooks/polar/route.ts` import 추가:

```ts
import { captureServerEvent } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
```

`activatePlan`의 성공적인 update(`if (error) throw error`) 다음에:

```ts
  if (error) throw error

  await captureServerEvent(userId, ANALYTICS_EVENTS.proActivated, { source: 'polar' })
```

- [ ] **Step 2: 계정 삭제 — `account_deleted` + 실패 로깅**

`src/app/api/account/route.ts`를 열어 삭제 흐름을 확인한다. 성공적으로 삭제가 끝나는 지점에서(현재 유저 id는 이미 해석되어 있음) 다음을 추가:

```ts
import { captureServerEvent } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { logError } from '@/lib/observability/logger'
```

- 성공 후: `await captureServerEvent(userId, ANALYTICS_EVENTS.accountDeleted)` (변수명은 실제 파일의 유저 id 변수에 맞춤)
- 기존 `console.error(\`Account data deletion failed after ${completedStage}\`, error)`를:
  `await logError(\`Account data deletion failed after ${completedStage}\`, { error, route: '/api/account', method: 'DELETE' })`로 교체.

- [ ] **Step 3: auth 콜백 실패 로깅**

`src/app/auth/callback/route.ts`의 세 `console.error` (`:27`, `:44`, `:53`)를 `logError`로 교체:

```ts
import { logError } from '@/lib/observability/logger'
```

예:
```ts
    await logError('OAuth session exchange failed', { error, route: '/auth/callback' })
```

(각 지점의 메시지는 기존 문자열 유지; error 객체가 없는 `:35` 지점은 `logError('...', { route: '/auth/callback' })`.)

- [ ] **Step 4: 업로드 실패 로깅**

`src/app/api/uploads/route.ts`의 `console.error(error)` (`:101`, `:105`)를 `await logError('Upload failed', { error, route: '/api/uploads', method: 'POST' })` 형태로 교체(핸들러가 async이므로 await 가능).

- [ ] **Step 5: 기존 테스트 확인/보정**

Run: `npm run test`
Expected: PASS. `auth/callback/route.test.ts`가 `expect(console.error).toHaveBeenCalled()`를 검사하므로(현재 `:65`,`:89`), logError가 내부적으로 `console.error`를 호출하는 것으로 통과해야 한다. 통과하지 않으면 해당 테스트를 `logError` 기대로 갱신하거나, logError가 console.error를 호출하는지 재확인.

- [ ] **Step 6: 빌드·린트·Commit**

```bash
npm run lint && npm run build
git add src/app/api/webhooks/polar/route.ts src/app/api/account/route.ts src/app/auth/callback/route.ts src/app/api/uploads/route.ts
git commit -m "feat(analytics): Pro 활성화·계정 삭제 서버 이벤트 및 실패 로깅 라우팅"
```

---

### Task 12: 통합 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 테스트·린트·빌드**

Run: `npm run test && npm run lint && npm run build`
Expected: 전부 PASS

- [ ] **Step 2: 로컬 수동 검증**

`.env.local`에 토큰이 있는 상태로 `npm run dev` 실행 후, PostHog Activity 피드(또는 이 세션의 PostHog MCP)에서 아래를 확인:
- 로그인 → `login_started`, `signed_in`, 사용자 `identify`(distinct_id = user.id)
- 업로드→매핑→저장 → `upload_started`, `upload_completed`, `mapping_completed`, `transactions_saved`
- 대시보드 진입 → `dashboard_viewed`, person 속성 `plan`
- Pro 결제 시작 → `pro_checkout_started`
- 결제 완료(샌드박스 웹훅) → `pro_activated`
- 로그아웃 → 이후 이벤트가 새 익명 id로 분리(reset 동작)

- [ ] **Step 3: 에러 캡처 검증**

- 의도적으로 API 500을 유발(예: 잘못된 입력으로 예외) → PostHog Error tracking에 서버 예외 도착 확인.
- 클라이언트에서 렌더 에러 유발 → `error.tsx` 폴백 + 예외 캡처 확인.

- [ ] **Step 4: 배포 환경변수 안내(코드 변경 없음)**

사용자에게 전달: Vercel(또는 호스팅) 프로젝트 환경변수에 아래 두 값을 등록해야 프로덕션에서 계측이 동작함.
```
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
NEXT_PUBLIC_POSTHOG_HOST
```

- [ ] **Step 5: 최종 Commit(있다면) 및 브랜치 정리**

```bash
git status
# 잔여 변경이 있으면 커밋. 완료 후 finishing-a-development-branch 스킬로 병합 방식 결정.
```

---

## Self-Review

- **Spec coverage:**
  - §4.1 Person 속성 → Task 6(email/auth_provider/signup_at/data_source는 UserSync, plan은 Task 10 DashboardClient `setUserProperties`). `data_source`는 클라이언트에서 직접 알기 어려워 생략 가능; 필요 시 UserSync에서 `NEXT_PUBLIC` 노출값으로 추가.
  - §4.2 퍼널 이벤트(9개) → Task 9(login/upload/mapping/transactions), Task 10(dashboard/checkout), Task 11(pro_activated). `signed_in`은 Task 6. ✅
  - §4.3 행동 이벤트 → `pro_report_generated`/`pro_insights_degraded`(Task 10), `account_deleted`(Task 11). `insights_viewed`는 대시보드 `dashboard_viewed`로 대체 커버(별도 지점 불명확하여 YAGNI로 생략 — 스펙 §12의 미확정 항목).
  - §5 에러 트래킹 → Task 7(클라이언트 바운더리), Task 8(서버 withErrorBoundary), Task 11(핵심 실패 로깅). ✅
  - §6 로깅 → Task 5(logger) + Task 11(주요 지점 라우팅). warn 이벤트화는 의도적 축소(문서화됨). ✅
  - §7 env/배포 → Task 1 + Task 12 Step 4. ✅
  - §8 CSP → Task 1 Step 6. ✅
  - §10 테스트 → 각 Task의 TDD 스텝 + Task 12. ✅
- **Placeholder scan:** 코드 스텝은 실제 코드 포함. `account_deleted`의 유저 id 변수명만 실제 파일 확인 후 매칭(파일 미read로 인한 유일한 확인 지점 — 명시함).
- **Type consistency:** `captureEvent`/`identifyUser`/`resetUser`/`setUserProperties`/`captureServerEvent`/`captureServerException`/`logError`/`logWarn` 시그니처가 정의 Task와 소비 Task 전반에서 일치. `ANALYTICS_EVENTS` 키 사용 일관.

## 미확정(구현 중 파일 확인 필요)

- `src/app/api/account/route.ts`의 성공 지점과 현재 유저 id 변수명(Task 11 Step 2).
- 컴포넌트 테스트 러너 방식: `@testing-library/react` 사용 여부는 기존 `AppShell.test.tsx`를 먼저 확인해 맞출 것(Task 6).
- CSP 존재 여부(Task 1 Step 6).
