import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        className={cn(
          'w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--brand)]/50 focus:ring-1 focus:ring-[var(--brand)]/20',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
