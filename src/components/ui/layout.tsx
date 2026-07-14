import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from './styles'

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-display text-title-md font-display text-primary', className)}>finsight</span>
}

export function TopNav({ actions, className }: { actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('border-b border-hairline bg-canvas', className)}>
      <nav aria-label="주요 메뉴" className="mx-auto flex min-h-16 max-w-container items-center gap-xl px-lg">
        <Link href="/dashboard" aria-label="핀사이트 대시보드"><Wordmark /></Link>
        <div className="ml-auto flex items-center gap-sm">
          {actions ?? (
            <>
              <Link href="/upload" className="text-nav font-nav text-body hover:text-ink">파일 업로드</Link>
              <Link href="/pro" className="inline-flex min-h-11 items-center rounded-pill bg-primary px-md text-button font-button text-on-primary hover:bg-primary-active">Pro 리포트</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-hairline bg-canvas', className)}>
      <div className="mx-auto flex max-w-container flex-wrap items-center justify-between gap-base px-lg py-xl text-caption text-muted">
        <Wordmark className="text-title-sm" />
        <span>개인 소비를 더 선명하게</span>
        <span className="font-mono tabular-nums">© 2026 finsight</span>
      </div>
    </footer>
  )
}
