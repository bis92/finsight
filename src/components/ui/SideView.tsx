'use client'

import type { ReactNode } from 'react'

import { cn } from './styles'

export type SideViewProps = {
  open: boolean
  title?: string
  children: ReactNode
  onClose: () => void
  className?: string
}

export function SideView({ open, title = '상세 보기', children, onClose, className }: SideViewProps) {
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-surface-dark/30" onClick={onClose} aria-hidden="true" />
      <aside
        aria-labelledby="sideview-title"
        className={cn('fs-slide fixed inset-y-0 right-0 z-50 w-full max-w-[380px] overflow-y-auto border-l border-hairline bg-canvas p-xl', className)}
      >
        <div className="mb-lg flex items-center justify-between gap-base">
          <h2 id="sideview-title" className="text-caption text-muted">{title}</h2>
          <button type="button" onClick={onClose} className="text-body-sm text-muted hover:text-ink" aria-label="닫기">닫기</button>
        </div>
        {children}
      </aside>
    </>
  )
}
