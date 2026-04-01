import { Check, LoaderCircle, Plus, Server } from 'lucide-react'

import { useI18n } from '../../../../i18n/use-i18n'
import { cn } from '../../../../lib/utils'
import type { ProviderPreset, ProviderState } from '../../../../types/chat'

interface ProviderPresetListProps {
  editingProviderId: number | null
  isLoadingProviders: boolean
  isSavingProvider: boolean
  onActivateProvider: (providerId: number) => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onEditProvider: (preset: ProviderPreset) => void
  onStartNewProvider: () => void
  providerState: ProviderState | null
}

export function ProviderPresetList({
  editingProviderId,
  isLoadingProviders,
  isSavingProvider,
  onActivateProvider,
  onDeleteProvider,
  onEditProvider,
  onStartNewProvider,
  providerState,
}: ProviderPresetListProps) {
  const { t } = useI18n()

  return (
    <div
      className="flex min-h-0 flex-col gap-4"
      data-testid="provider-presets-column"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t('settings.savedPresets')}
          </h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t('settings.onePresetActive')}
          </p>
        </div>
        <button
          aria-label={t('settings.createProviderPreset')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
          onClick={onStartNewProvider}
          title={t('settings.createProviderPreset')}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {isLoadingProviders ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 py-4 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {t('settings.loadingPresets')}
        </div>
      ) : providerState && providerState.presets.length > 0 ? (
        <div
          className="min-h-0 space-y-3 overflow-y-auto pr-1 lg:max-h-[min(52vh,36rem)]"
          data-testid="provider-presets-list"
        >
          {providerState.presets.map((preset) => (
            <div
              className={cn(
                'rounded-2xl border px-4 py-4 transition',
                editingProviderId === preset.id
                  ? 'border-[var(--brand)]/40 bg-[var(--brand)]/[0.04]'
                  : 'border-[var(--line)] bg-[var(--surface-strong)] hover:bg-[var(--hover-bg)]',
              )}
              key={preset.id}
            >
              <button
                className="w-full text-left"
                onClick={() => onEditProvider(preset)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {preset.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                      {(preset.format ?? 'openai')} · {preset.defaultModel}
                    </p>
                  </div>
                  {preset.isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)]/[0.08] px-2.5 py-1 text-xs font-medium text-[var(--brand-strong)]">
                      <Check className="h-3.5 w-3.5" />
                      {t('settings.active')}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 truncate text-xs text-[var(--muted-foreground)]">
                  {preset.baseURL}
                </p>
                <p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">
                  {t('settings.key')}: {preset.apiKeyHint || t('settings.noStoredKey')}
                </p>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {preset.models.join(', ')}
                </p>
              </button>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--hover-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={preset.isActive || isSavingProvider}
                  onClick={() => onActivateProvider(preset.id)}
                  type="button"
                >
                  {t('settings.setActive')}
                </button>
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSavingProvider}
                  onClick={() => onDeleteProvider(preset)}
                  type="button"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--app-bg)] px-4 py-5 text-sm text-[var(--muted-foreground)]">
          {t('settings.noSavedPresets')}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {t('settings.serverFallback')}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {providerState?.fallback.available
                ? t('settings.serverReady')
                : t('settings.serverNotConfigured')}
            </p>
          </div>
          <Server className="mt-0.5 h-4 w-4 text-[var(--muted-foreground)]" />
        </div>
        <p className="mt-3 truncate text-xs text-[var(--muted-foreground)]">
          {providerState?.fallback.baseURL || t('settings.noFallbackBaseUrl')}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {providerState?.fallback.defaultModel || t('settings.noFallbackModel')}
        </p>
      </div>
    </div>
  )
}
