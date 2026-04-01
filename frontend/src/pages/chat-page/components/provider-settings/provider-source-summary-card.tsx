import { useI18n } from '../../../../i18n/use-i18n'
import type { ProviderPreset, ProviderState } from '../../../../types/chat'
import { describeProviderSource } from '../../utils'

interface ProviderSourceSummaryCardProps {
  activePreset: ProviderPreset | null
  providerState: ProviderState | null
}

export function ProviderSourceSummaryCard({
  activePreset,
  providerState,
}: ProviderSourceSummaryCardProps) {
  const { t } = useI18n()

  return (
    <div className="shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-5 py-4">
      <p className="text-sm font-medium text-[var(--foreground)]">
        {t('settings.currentSource')}
      </p>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        {describeProviderSource(providerState, activePreset, t)}
      </p>
    </div>
  )
}
