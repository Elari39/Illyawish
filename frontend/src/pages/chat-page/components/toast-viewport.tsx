import { AlertCircle, X } from 'lucide-react'

import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { ToastState } from '../types'

interface ToastViewportProps {
  toasts: ToastState[]
  onDismiss: (toastId: number) => void
  onPause: (toastId: number) => void
  onResume: (toastId: number) => void
}

export function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: ToastViewportProps) {
  const { t } = useI18n()

  if (toasts.length === 0) {
    return null
  }

  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3"
      role="region"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto rounded-2xl border px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur transition-[border-color,background-color,box-shadow] duration-200',
            toast.variant === 'success' &&
              'border-[var(--brand)]/15 bg-[var(--brand)]/8 text-[var(--foreground)]',
            toast.variant === 'error' &&
              'border-[var(--danger)]/35 bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface)_88%)] text-[var(--foreground)] shadow-[0_16px_40px_rgba(120,26,26,0.18)]',
            toast.variant === 'info' &&
              'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)]',
          )}
          onMouseEnter={toast.variant === 'error' ? () => onPause(toast.id) : undefined}
          onMouseLeave={toast.variant === 'error' ? () => onResume(toast.id) : undefined}
          role={toast.variant === 'error' ? 'alert' : 'status'}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {toast.variant === 'error' ? (
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-[var(--danger)]">
                  <AlertCircle className="h-4 w-4" />
                </span>
              ) : null}
              <p className="text-sm leading-6">{toast.message}</p>
            </div>
            <button
              aria-label={t('common.close')}
              className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)]',
                toast.variant === 'error'
                  ? 'h-8 w-8 border border-[color-mix(in_srgb,var(--danger)_18%,var(--line)_82%)] bg-[color-mix(in_srgb,var(--surface)_88%,var(--danger)_12%)] text-[var(--danger)]'
                  : 'h-6 w-6',
              )}
              onClick={() => onDismiss(toast.id)}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
