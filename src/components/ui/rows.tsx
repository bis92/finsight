'use client'

import type { ReactNode } from 'react'

import { formatKstDate } from '@/lib/format'
import type { Category, ColumnRole, Direction } from '@/types'

import { Amount } from './Amount'
import { CATEGORY_COLORS } from './charts'
import { cn } from './styles'

export function TxRow({ merchant, occurredOn, category, amount, direction, card, onClick, className }: {
  merchant: string
  occurredOn: string
  category: Category
  amount: number
  direction: Direction
  card?: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} className={cn('grid w-full grid-cols-[72px_1fr_auto] items-center gap-base border-t border-hairline-soft py-sm text-left hover:bg-surface-soft', className)}>
      <span className="font-mono text-caption text-muted tabular-nums">{formatKstDate(occurredOn).slice(5)}</span>
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-title-sm">{merchant}</span>
        <span className="mt-xxs flex items-center gap-xs text-caption text-muted">
          <span className="h-xs w-xs rounded-full" style={{ backgroundColor: CATEGORY_COLORS[category] }} aria-hidden="true" />
          {category}{card ? ` · ${card}` : ''}
        </span>
      </span>
      <Amount value={amount} direction={direction} className="text-body-sm" />
    </button>
  )
}

export function MerchantRow({ rank, merchant, amount, count, className }: { rank?: number; merchant: string; amount: number; count: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-sm border-t border-hairline-soft py-sm text-body-sm', className)}>
      {rank === undefined ? null : <span className="w-md font-mono text-caption text-muted tabular-nums">{rank}</span>}
      <span className="flex-1 font-title-sm">{merchant}</span>
      <span className="font-mono text-caption text-muted tabular-nums">{count}건</span>
      <Amount value={amount} className="min-w-24 text-right text-body-sm" />
    </div>
  )
}

export function SubscriptionRow({ merchant, amount, cadence, note, className }: { merchant: string; amount: number; cadence: string; note?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-sm border-t border-hairline-soft py-sm', className)}>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-body-sm font-title-sm">{merchant}</span>
        {note ? <span className="block truncate text-caption text-muted">{note}</span> : null}
      </span>
      <span className="text-caption text-muted">{cadence}</span>
      <Amount value={amount} className="text-body-sm" />
    </div>
  )
}

export function FilterChip({ active = false, category, children, onClick, className }: { active?: boolean; category?: Category; children?: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn('inline-flex items-center gap-xs rounded-pill border px-sm py-xs text-caption font-medium', active ? 'border-primary bg-primary text-on-primary' : 'border-hairline bg-canvas text-body hover:bg-surface-soft', className)}>
      {category ? <span className="h-xs w-xs rounded-full" style={{ backgroundColor: CATEGORY_COLORS[category] }} aria-hidden="true" /> : null}
      {children ?? category}
    </button>
  )
}

const ROLE_LABELS: Record<ColumnRole, string> = {
  date: '거래일',
  merchant: '가맹점',
  amount: '금액',
  category: '카테고리',
}

export function MappingRow({ source, role, confidence, control, className }: { source: string; role: ColumnRole | null; confidence?: number; control?: ReactNode; className?: string }) {
  const lowConfidence = confidence !== undefined && confidence < 0.75
  return (
    <div className={cn('grid grid-cols-[1fr_1fr_88px] items-center gap-base border-t border-hairline-soft py-sm text-body-sm', className)}>
      <span className="font-title-sm">{source}</span>
      {control ?? <span className="w-fit rounded-pill bg-surface-strong px-sm py-xxs text-caption-strong font-caption-strong">{role ? ROLE_LABELS[role] : '무시'}</span>}
      <span className={cn('text-right font-mono text-caption tabular-nums', lowConfidence ? 'text-semantic-down' : 'text-muted')}>
        {confidence === undefined ? '—' : `${Math.round(confidence * 100)}%`}
      </span>
    </div>
  )
}
