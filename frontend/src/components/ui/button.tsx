import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--brand)] text-white shadow-sm hover:bg-[var(--brand-strong)] active:scale-[0.98]',
  secondary:
    'border border-[var(--line)] bg-transparent text-[var(--foreground)] hover:bg-[var(--hover-bg)]',
  ghost:
    'text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]',
  danger:
    'border border-transparent bg-[var(--danger)] text-white hover:opacity-90',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 disabled:cursor-not-allowed disabled:opacity-50',
        variantClassName[variant],
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
