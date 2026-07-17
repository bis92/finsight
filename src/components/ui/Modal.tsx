'use client'

import type { ReactNode } from 'react'

import { cn } from './styles'

export type ModalProps = {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
}

export function Modal({ open, title, children, onClose, className }: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-dark/50 p-md" onMouseDown={onClose}>
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className={cn('w-full max-w-md rounded-xl bg-canvas p-card text-left', className)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mb-lg flex items-start justify-between gap-base">
          <h2 id="modal-title" className="font-sans text-title-md font-title-md">{title}</h2>
          <button type="button" onClick={onClose} className="text-body-sm text-muted hover:text-ink" aria-label="닫기">닫기</button>
        </div>
        {children}
      </section>
    </div>
  )
}
