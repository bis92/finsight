import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from './styles'

export type CardProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode
}

export function Card({ title, children, className, ...props }: CardProps) {
  return (
    <section className={cn('rounded-xl border border-hairline bg-canvas p-card hover:shadow-soft', className)} {...props}>
      {title ? <div className="mb-base text-body-sm text-muted">{title}</div> : null}
      {children}
    </section>
  )
}
