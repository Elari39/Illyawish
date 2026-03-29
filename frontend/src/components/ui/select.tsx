import { forwardRef, type SelectHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        className={cn(
          'w-full appearance-none rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--brand)]/50 focus:ring-1 focus:ring-[var(--brand)]/20 disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--muted-foreground)]',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
