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
