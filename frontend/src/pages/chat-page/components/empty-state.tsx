import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'

interface EmptyStateProps {
  hasConversations: boolean
  hasLastConversation: boolean
  onContinueLast: () => void
}

export function EmptyState({
  hasConversations,
  hasLastConversation,
  onContinueLast,
}: EmptyStateProps) {
  const { t } = useI18n()

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
      <div className="w-full max-w-xl space-y-4 text-center">
        <h2 className="font-['Lora',serif] text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
          {t('empty.title')}
        </h2>
        <p className="text-base leading-7 text-[var(--muted-foreground)]">
          {hasConversations
            ? t('empty.withConversations')
            : t('empty.withoutConversations')}
        </p>
        {hasConversations && hasLastConversation ? (
          <div className="pt-2">
            <Button onClick={onContinueLast} variant="secondary">
              {t('empty.continueLastConversation')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
