import type { HTMLAttributes, ReactNode } from 'react'

import { Card } from './Card'
import { cn } from './styles'

export type StatCardProps = HTMLAttributes<HTMLElement> & {
  label: string
  value: ReactNode
}

export function StatCard({ label, value, className, ...props }: StatCardProps) {
  return (
    <Card className={cn('p-lg', className)} {...props}>
      <div className="text-body-sm text-muted">{label}</div>
      <div className="mt-xs font-mono text-[28px] font-number leading-tight tabular-nums">{value}</div>
    </Card>
  )
}
