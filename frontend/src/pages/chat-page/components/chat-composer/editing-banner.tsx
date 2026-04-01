import { Button } from '../../../../components/ui/button'
import { useI18n } from '../../../../i18n/use-i18n'

interface EditingBannerProps {
  onCancelEdit: () => void
}

export function EditingBanner({ onCancelEdit }: EditingBannerProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
      <span>{t('chat.editingBanner')}</span>
      <Button onClick={onCancelEdit} variant="ghost">
        {t('common.cancel')}
      </Button>
    </div>
  )
}
