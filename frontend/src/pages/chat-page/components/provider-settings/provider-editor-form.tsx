import type { RefObject } from 'react'

import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { Select } from '../../../../components/ui/select'
import { useI18n } from '../../../../i18n/use-i18n'
import type { ProviderPreset, ProviderState } from '../../../../types/chat'
import type { ProviderFormState } from '../../types'
import { ProviderModelEditor } from '../provider-model-editor'

interface ProviderEditorFormProps {
  canReuseActiveAPIKey: boolean
  editingProviderId: number | null
  hasPrimaryFieldError: boolean
  onProviderFieldChange: (
    field: 'format' | 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) => void
  onProviderModelsChange: (
    value: {
      defaultModel: string
      models: string[]
    },
  ) => void
  onResetProvider: () => void
  providerForm: ProviderFormState
  providerState: ProviderState | null
  nameInputRef: RefObject<HTMLInputElement | null>
  baseURLInputRef: RefObject<HTMLInputElement | null>
  apiKeyInputRef: RefObject<HTMLInputElement | null>
}

export function ProviderEditorForm({
  canReuseActiveAPIKey,
  editingProviderId,
  hasPrimaryFieldError,
  onProviderFieldChange,
  onProviderModelsChange,
  onResetProvider,
  providerForm,
  providerState,
  nameInputRef,
  baseURLInputRef,
  apiKeyInputRef,
}: ProviderEditorFormProps) {
  const { t } = useI18n()
  const editingPreset =
    editingProviderId == null || !providerState
      ? null
      : providerState.presets.find((preset) => preset.id === editingProviderId) ??
        null

  return (
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
            {t('settings.providerFormat')}
          </span>
          <Select
            aria-label={t('settings.providerFormat')}
            value={providerForm.format}
            onChange={(event) => onProviderFieldChange('format', event.target.value)}
          >
            <option value="openai">{t('settings.providerFormatOpenAI')}</option>
            <option value="anthropic">{t('settings.providerFormatAnthropic')}</option>
            <option value="gemini">{t('settings.providerFormatGemini')}</option>
          </Select>
          {providerForm.errors.format ? (
            <p className="text-xs text-[var(--danger)]">
              {providerForm.errors.format}
            </p>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('settings.presetName')}
          </span>
          <Input
            ref={nameInputRef}
            placeholder={t('settings.presetNamePlaceholder')}
            value={providerForm.name}
            onChange={(event) => onProviderFieldChange('name', event.target.value)}
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
            placeholder={providerForm.baseURL}
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
            placeholder={resolveApiKeyPlaceholder({
              canReuseActiveAPIKey,
              editingProviderId,
              editingPreset,
              t,
            })}
            type="password"
            value={providerForm.apiKey}
            onChange={(event) => onProviderFieldChange('apiKey', event.target.value)}
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
  )
}

function resolveApiKeyPlaceholder({
  canReuseActiveAPIKey,
  editingProviderId,
  editingPreset,
  t,
}: {
  canReuseActiveAPIKey: boolean
  editingProviderId: number | null
  editingPreset: ProviderPreset | null
  t: ReturnType<typeof useI18n>['t']
}) {
  if (editingProviderId) {
    return editingPreset?.apiKeyHint
      ? t('settings.apiKeyPlaceholderEditHint', {
          hint: editingPreset.apiKeyHint,
        })
      : t('settings.apiKeyPlaceholderEdit')
  }

  return canReuseActiveAPIKey
    ? t('settings.apiKeyPlaceholderNewReuse')
    : t('settings.apiKeyPlaceholderNew')
}
