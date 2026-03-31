import { Check, LoaderCircle, Plus, Server } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { ProviderPreset, ProviderState } from '../../../types/chat'
import type { ProviderFormState } from '../types'
import { describeProviderSource } from '../utils'
import { ProviderModelEditor } from './provider-model-editor'

interface ProviderSettingsTabProps {
  canReuseActiveAPIKey: boolean
  editingProviderId: number | null
  isLoadingProviders: boolean
  isSavingProvider: boolean
  onActivateProvider: (providerId: number) => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onEditProvider: (preset: ProviderPreset) => void
  onProviderFieldChange: (
    field: 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) => void
  onProviderModelsChange: (
    value: {
      defaultModel: string
      models: string[]
    },
  ) => void
  onResetProvider: () => void
  onStartNewProvider: () => void
  providerForm: ProviderFormState
  providerState: ProviderState | null
}

export function ProviderSettingsTab({
  canReuseActiveAPIKey,
  editingProviderId,
  isLoadingProviders,
  isSavingProvider,
  onActivateProvider,
  onDeleteProvider,
  onEditProvider,
  onProviderFieldChange,
  onProviderModelsChange,
  onResetProvider,
  onStartNewProvider,
  providerForm,
  providerState,
}: ProviderSettingsTabProps) {
  const { t } = useI18n()
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const baseURLInputRef = useRef<HTMLInputElement | null>(null)
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null)
  const hasPrimaryFieldError = Boolean(
    providerForm.errors.name ||
      providerForm.errors.baseURL ||
      providerForm.errors.apiKey,
  )
  const editingPreset =
    editingProviderId == null || !providerState
      ? null
      : providerState.presets.find((preset) => preset.id === editingProviderId) ?? null
  const activePreset =
    providerState?.presets.find((preset) => preset.isActive) ?? null

  useEffect(() => {
    if (providerForm.errors.name) {
      nameInputRef.current?.focus()
      return
    }
    if (providerForm.errors.baseURL) {
      baseURLInputRef.current?.focus()
      return
    }
    if (providerForm.errors.apiKey) {
      apiKeyInputRef.current?.focus()
    }
  }, [
    providerForm.errors.apiKey,
    providerForm.errors.baseURL,
    providerForm.errors.name,
  ])

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-5 py-4">
        <p className="text-sm font-medium text-[var(--foreground)]">
          {t('settings.currentSource')}
        </p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {describeProviderSource(providerState, activePreset, t)}
        </p>
      </div>

      <div
        className="grid min-h-0 gap-6 lg:grid-cols-[minmax(16rem,18.75rem)_minmax(0,1fr)]"
        data-testid="provider-settings-layout"
      >
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
                          {preset.defaultModel}
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

        <div
          className="min-h-0 overflow-y-auto rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5 lg:max-h-[min(52vh,36rem)]"
          data-testid="provider-editor-column"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--foreground)]">
                {editingProviderId
                  ? t('settings.editPreset')
                  : t('settings.newPreset')}
              </h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {t('settings.presetDescription')}
              </p>
            </div>
            {editingProviderId ? (
              <Button onClick={onResetProvider} variant="ghost">
                {t('settings.newPreset')}
              </Button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.presetName')}
              </span>
              <Input
                ref={nameInputRef}
                placeholder={t('settings.presetNamePlaceholder')}
                value={providerForm.name}
                onChange={(event) =>
                  onProviderFieldChange('name', event.target.value)
                }
              />
              {providerForm.errors.name ? (
                <p className="text-xs text-[var(--danger)]">
                  {providerForm.errors.name}
                </p>
              ) : null}
            </label>

            <ProviderModelEditor
              defaultModel={providerForm.defaultModel}
              errors={providerForm.errors}
              models={providerForm.models}
              onChange={onProviderModelsChange}
              shouldFocusErrors={!hasPrimaryFieldError}
            />

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.baseUrl')}
              </span>
              <Input
                ref={baseURLInputRef}
                placeholder="https://api.openai.com/v1"
                value={providerForm.baseURL}
                onChange={(event) =>
                  onProviderFieldChange('baseURL', event.target.value)
                }
              />
              {providerForm.errors.baseURL ? (
                <p className="text-xs text-[var(--danger)]">
                  {providerForm.errors.baseURL}
                </p>
              ) : null}
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.apiKey')}
              </span>
              <Input
                ref={apiKeyInputRef}
                placeholder={
                  editingProviderId
                    ? editingPreset?.apiKeyHint
                      ? t('settings.apiKeyPlaceholderEditHint', {
                          hint: editingPreset.apiKeyHint,
                        })
                      : t('settings.apiKeyPlaceholderEdit')
                    : canReuseActiveAPIKey
                      ? t('settings.apiKeyPlaceholderNewReuse')
                      : t('settings.apiKeyPlaceholderNew')
                }
                type="password"
                value={providerForm.apiKey}
                onChange={(event) =>
                  onProviderFieldChange('apiKey', event.target.value)
                }
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                {editingProviderId
                  ? t('settings.apiKeyHelpEdit')
                  : canReuseActiveAPIKey
                    ? t('settings.apiKeyHelpNewReuse')
                    : t('settings.apiKeyHelpNew')}
              </p>
              {editingProviderId && editingPreset?.hasApiKey ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t('settings.apiKeyStoredHint', { hint: editingPreset.apiKeyHint })}
                </p>
              ) : null}
              {providerForm.errors.apiKey ? (
                <p className="text-xs text-[var(--danger)]">
                  {providerForm.errors.apiKey}
                </p>
              ) : null}
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
