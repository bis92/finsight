import type { HTMLAttributes } from 'react'

import { cn } from './styles'

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'neutral' | 'free' | 'pro'
}

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-sm py-xxs text-caption-strong font-caption-strong',
        variant === 'pro' ? 'bg-primary text-on-primary' : 'bg-surface-strong text-body',
        className,
      )}
      {...props}
    />
  )
}

export const Pill = Badge
