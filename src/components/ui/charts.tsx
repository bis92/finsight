'use client'

import type { Category } from '@/types'

import { Amount } from './Amount'
import { cn } from './styles'

export const CATEGORY_COLORS = {
  식비: '#0052ff',
  쇼핑: '#0a2a8f',
  주거: '#2f6bff',
  구독: '#5185ff',
  금융: '#3d5a9e',
  공과금: '#7aa1ff',
  교육: '#6b8fd6',
  의료: '#8aa6ff',
  교통: '#9bb6ff',
  '문화/여가': '#bcccff',
  '카페/간식': '#d1ddff',
  기타: '#aeb8cc',
  수입: '#05b169',
} satisfies Record<Category, string>

export type ChartDatum = { category: Category; amount: number }

export function Donut({ data, size = 180, thickness = 26, label = '카테고리별 금액 비율' }: { data: ChartDatum[]; size?: number; thickness?: number; label?: string }) {
  const total = data.reduce((sum, item) => sum + Math.max(0, item.amount), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="block">
      {total === 0 ? (
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-surface-strong)" strokeWidth={thickness} />
      ) : data.map((item) => {
        const dash = (Math.max(0, item.amount) / total) * circumference
        const dashOffset = -offset
        offset += dash
        return (
          <circle
            key={item.category}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={CATEGORY_COLORS[item.category]}
            strokeWidth={thickness}
            strokeDasharray={`${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`}
            strokeDashoffset={dashOffset.toFixed(2)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )
      })}
    </svg>
  )
}

export function BarRow({ category, amount, maxAmount, className }: { category: Category; amount: number; maxAmount: number; className?: string }) {
  const percentage = maxAmount > 0 ? Math.min(100, Math.max(0, (amount / maxAmount) * 100)) : 0
  return (
    <div className={cn('grid grid-cols-[96px_1fr_auto] items-center gap-sm text-body-sm', className)}>
      <span>{category}</span>
      <div className="h-xs overflow-hidden rounded-pill bg-surface-strong">
        <div className="h-full rounded-pill" style={{ width: `${percentage}%`, backgroundColor: CATEGORY_COLORS[category] }} />
      </div>
      <Amount value={amount} className="text-body-sm text-ink" />
    </div>
  )
}

export function LegendRow({ category, amount, ratio, className }: ChartDatum & { ratio?: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-sm text-body-sm', className)}>
      <span className="h-xs w-xs shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[category] }} aria-hidden="true" />
      <span className="flex-1">{category}</span>
      {ratio === undefined ? null : <span className="font-mono text-caption text-muted tabular-nums">{Math.round(ratio * 100)}%</span>}
      <Amount value={amount} className="text-body-sm text-ink" />
    </div>
  )
}
