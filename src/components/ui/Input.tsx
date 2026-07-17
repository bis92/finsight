import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from './styles'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn('min-h-11 w-full rounded-md border border-hairline bg-canvas px-base text-left text-body-sm text-ink outline-none placeholder:text-muted-soft focus:shadow-focus', className)}
        {...props}
      />
    )
  },
)
