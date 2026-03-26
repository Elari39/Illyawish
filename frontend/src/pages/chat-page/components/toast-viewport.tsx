import { X } from 'lucide-react'

import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { ToastState } from '../types'

interface ToastViewportProps {
  toasts: ToastState[]
  onDismiss: (toastId: number) => void
}

export function ToastViewport({
  toasts,
  onDismiss,
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
            'pointer-events-auto rounded-2xl border px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur',
            toast.variant === 'success' &&
              'border-[var(--brand)]/15 bg-[var(--brand)]/8 text-[var(--foreground)]',
            toast.variant === 'error' &&
              'border-[var(--danger)]/15 bg-[var(--danger)]/8 text-[var(--foreground)]',
            toast.variant === 'info' &&
              'border-[var(--line)] bg-white/95 text-[var(--foreground)]',
          )}
          role={toast.variant === 'error' ? 'alert' : 'status'}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-6">{toast.message}</p>
            <button
              aria-label={t('common.close')}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-black/5"
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
