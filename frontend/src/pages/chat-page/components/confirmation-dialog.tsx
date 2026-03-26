import { useState } from 'react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { ConfirmationState } from '../types'

interface ConfirmationDialogProps {
  confirmation: ConfirmationState | null
  onClose: () => void
}

export function ConfirmationDialog({
  confirmation,
  onClose,
}: ConfirmationDialogProps) {
  const { t } = useI18n()
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!confirmation) {
    return null
  }

  const currentConfirmation = confirmation

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      await currentConfirmation.onConfirm()
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-lg)]">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          {currentConfirmation.title}
        </h3>
        {currentConfirmation.description ? (
          <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
            {currentConfirmation.description}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onClose} variant="secondary">
            {t('common.cancel')}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => void handleConfirm()}
            variant={currentConfirmation.variant === 'danger' ? 'danger' : 'primary'}
          >
            {isSubmitting ? t('common.saving') : currentConfirmation.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
