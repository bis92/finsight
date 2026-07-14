import type { ButtonHTMLAttributes } from 'react'

import { cn } from './styles'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline-on-dark' | 'text'
  size?: 'md' | 'cta'
}

const variants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-active active:bg-primary-active disabled:bg-primary-disabled',
  secondary: 'border border-hairline bg-canvas text-ink hover:bg-surface-soft',
  'outline-on-dark': 'border border-on-dark/40 bg-transparent text-on-dark hover:border-on-dark',
  text: 'bg-transparent text-primary hover:text-primary-active',
} as const

const sizes = {
  md: 'min-h-11 px-md py-xs',
  cta: 'min-h-12 px-xl py-sm',
} as const

export function Button({ className, variant = 'primary', size = 'md', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-pill text-button font-button focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
