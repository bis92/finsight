import type { HTMLAttributes } from 'react'

import { formatKrw } from '@/lib/format'
import type { Direction } from '@/types'

import { cn } from './styles'

export type AmountProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  value: number
  direction?: Direction | 'saving' | 'neutral'
  currencySymbol?: boolean
}

export function Amount({ value, direction = 'neutral', currencySymbol = false, className, ...props }: AmountProps) {
  const formatted = currencySymbol ? `₩${formatKrw(value).slice(0, -1)}` : formatKrw(value)
  return (
    <span
      className={cn(
        'font-mono font-number tabular-nums',
        direction === 'expense' && 'text-semantic-down',
        (direction === 'income' || direction === 'saving') && 'text-semantic-up',
        className,
      )}
      {...props}
    >
      {formatted}
    </span>
  )
}
