import { Check, LoaderCircle, Plus, Server, X } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type {
  ConversationSettings,
  ProviderPreset,
  ProviderState,
} from '../../../types/chat'
import type {
  ProviderFormState,
  SettingsTab,
} from '../types'
import { OPENAI_COMPATIBLE_DEFAULT_BASE_URL } from '../types'
import { describeProviderSource } from '../utils'

interface SettingsPanelProps {
  activeTab: SettingsTab
  editingProviderId: number | null
  isLoadingProviders: boolean
  isOpen: boolean
  isSavingProvider: boolean
  isTestingProvider: boolean
  isSaving: boolean
  onActivateProvider: (providerId: number) => void
  settings: ConversationSettings
  providerForm: ProviderFormState
  providerState: ProviderState | null
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
  setProviderForm: Dispatch<SetStateAction<ProviderFormState>>
  onClose: () => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onEditProvider: (preset: ProviderPreset) => void
  onProviderTabChange: (tab: SettingsTab) => void
  onReset: () => void
  onResetProvider: () => void
  onSave: () => void
  onSaveProvider: () => void
  onTestProvider: () => void
  onStartNewProvider: () => void
}

export function SettingsPanel({
  activeTab,
  editingProviderId,
  isLoadingProviders,
  isOpen,
  isSavingProvider,
  isTestingProvider,
  isSaving,
  onActivateProvider,
  settings,
  providerForm,
  providerState,
  setSettings,
  setProviderForm,
  onClose,
  onDeleteProvider,
  onEditProvider,
  onProviderTabChange,
  onReset,
  onResetProvider,
  onSave,
  onSaveProvider,
  onTestProvider,
  onStartNewProvider,
}: SettingsPanelProps) {
  const { t } = useI18n()

  if (!isOpen) {
    return null
  }

  const activePreset =
    providerState?.presets.find((preset) => preset.isActive) ?? null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-['Lora',serif] text-2xl font-bold tracking-tight">
              {t('settings.title')}
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
              {activeTab === 'chat'
                ? t('settings.chatDescription')
                : t('settings.providerDescription')}
            </p>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-black/5"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 inline-flex rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] p-1">
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'chat'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('chat')}
            type="button"
          >
            {t('settings.chatTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'provider'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('provider')}
            type="button"
          >
            {t('settings.providerTab')}
          </button>
        </div>

        {activeTab === 'chat' ? (
          <div className="mt-6 grid gap-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.model')}
              </span>
              <Input
                placeholder={t('settings.modelPlaceholder')}
                value={settings.model}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    model: event.target.value,
                  }))
                }
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.systemPrompt')}
              </span>
              <Textarea
                className="min-h-[160px] rounded-xl border border-[var(--line)] bg-white px-4 py-3"
                value={settings.systemPrompt}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    systemPrompt: event.target.value,
                  }))
                }
              />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {t('settings.temperature')}
                </span>
                <Input
                  min="0"
                  max="2"
                  step="0.1"
                  type="number"
                  value={settings.temperature ?? ''}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      temperature:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {t('settings.maxTokens')}
                </span>
                <Input
                  min="0"
                  step="1"
                  type="number"
                  value={settings.maxTokens ?? ''}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      maxTokens:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-5 py-4">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.currentSource')}
              </p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {describeProviderSource(providerState, activePreset, t)}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
              <div className="space-y-4">
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
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
                  <div className="space-y-3">
                    {providerState.presets.map((preset) => (
                      <button
                        key={preset.id}
                        className={cn(
                          'w-full rounded-2xl border px-4 py-4 text-left transition',
                          editingProviderId === preset.id
                            ? 'border-[var(--brand)]/40 bg-[var(--brand)]/[0.04]'
                            : 'border-[var(--line)] bg-white hover:bg-black/[0.02]',
                        )}
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
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {t('settings.key')}: {preset.apiKeyHint}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={preset.isActive || isSavingProvider}
                            onClick={(event) => {
                              event.stopPropagation()
                              onActivateProvider(preset.id)
                            }}
                            type="button"
                          >
                            {t('settings.setActive')}
                          </button>
                          <button
                            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSavingProvider}
                            onClick={(event) => {
                              event.stopPropagation()
                              onDeleteProvider(preset)
                            }}
                            type="button"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </button>
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

              <div className="rounded-[1.75rem] border border-[var(--line)] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--foreground)]">
                      {editingProviderId ? t('settings.editPreset') : t('settings.newPreset')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {t('settings.presetDescription')}
                    </p>
                  </div>
                  {editingProviderId ? (
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition hover:bg-black/[0.04] hover:text-[var(--foreground)]"
                      onClick={onResetProvider}
                      type="button"
                    >
                      {t('settings.newPreset')}
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.presetName')}
                    </span>
                    <Input
                      placeholder={t('settings.presetNamePlaceholder')}
                      value={providerForm.name}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.defaultModelLabel')}
                    </span>
                    <Input
                      placeholder="gpt-4.1-mini"
                      value={providerForm.defaultModel}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          defaultModel: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.baseUrl')}
                    </span>
                    <Input
                      placeholder={OPENAI_COMPATIBLE_DEFAULT_BASE_URL}
                      value={providerForm.baseURL}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          baseURL: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.apiKey')}
                    </span>
                    <Input
                      placeholder={
                        editingProviderId
                          ? t('settings.apiKeyPlaceholderEdit')
                          : t('settings.apiKeyPlaceholderNew')
                      }
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          apiKey: event.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {editingProviderId
                        ? t('settings.apiKeyHelpEdit')
                        : t('settings.apiKeyHelpNew')}
                    </p>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {activeTab === 'chat' ? (
            <>
              <Button onClick={onReset} variant="ghost">
                {t('common.reset')}
              </Button>
              <Button onClick={onClose} variant="secondary">
                {t('common.close')}
              </Button>
              <Button disabled={isSaving} onClick={onSave}>
                {isSaving ? t('common.saving') : t('settings.saveSettings')}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onResetProvider} variant="ghost">
                {editingProviderId ? t('settings.newPreset') : t('settings.resetForm')}
              </Button>
              <Button
                disabled={isLoadingProviders || isSavingProvider || isTestingProvider}
                onClick={onTestProvider}
                variant="secondary"
              >
                {isTestingProvider
                  ? t('settings.testingConnection')
                  : t('settings.testConnection')}
              </Button>
              <Button onClick={onClose} variant="secondary">
                {t('common.close')}
              </Button>
              <Button
                disabled={isLoadingProviders || isSavingProvider}
                onClick={onSaveProvider}
              >
                {isSavingProvider
                  ? t('common.saving')
                  : editingProviderId
                    ? t('settings.savePreset')
                    : t('settings.createPreset')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
