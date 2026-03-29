import { useEffect, useId, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import type { PromptState } from '../types'

interface PromptDialogProps {
  promptState: PromptState | null
  onClose: () => void
}

export function PromptDialog({
  promptState,
  onClose,
}: PromptDialogProps) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const titleId = useId()

  useEffect(() => {
    setValue(promptState?.initialValue ?? '')
  }, [promptState])

  useEffect(() => {
    if (!promptState) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSubmitting, onClose, promptState])

  if (!promptState) {
    return null
  }

  const currentPrompt = promptState

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      await currentPrompt.onSubmit(value)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-lg)]"
        role="dialog"
      >
        <h3 className="text-lg font-semibold text-[var(--foreground)]" id={titleId}>
          {currentPrompt.title}
        </h3>
        <div className="mt-4">
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isSubmitting) {
                event.preventDefault()
                void handleSubmit()
              }
            }}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onClose} variant="secondary">
            {t('common.cancel')}
          </Button>
          <Button disabled={isSubmitting} onClick={() => void handleSubmit()}>
            {isSubmitting ? t('common.saving') : currentPrompt.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
