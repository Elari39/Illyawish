import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

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
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!confirmation) {
      return
    }

    cancelButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [confirmation, isSubmitting, onClose])

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div
        aria-describedby={currentConfirmation.description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-lg)]"
        role="dialog"
      >
        <h3 className="text-lg font-semibold text-[var(--foreground)]" id={titleId}>
          {currentConfirmation.title}
        </h3>
        {currentConfirmation.description ? (
          <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]" id={descriptionId}>
            {currentConfirmation.description}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onClose} ref={cancelButtonRef} variant="secondary">
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
