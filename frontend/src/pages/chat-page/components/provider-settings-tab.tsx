import { useEffect, useRef } from 'react'

import type { ProviderPreset, ProviderState } from '../../../types/chat'
import type { ProviderFormState } from '../types'
import { ProviderEditorForm } from './provider-settings/provider-editor-form'
import { ProviderPresetList } from './provider-settings/provider-preset-list'
import { ProviderSourceSummaryCard } from './provider-settings/provider-source-summary-card'

interface ProviderSettingsTabProps {
  canReuseActiveAPIKey: boolean
  editingProviderId: number | null
  isLoadingProviders: boolean
  isSavingProvider: boolean
  onActivateProvider: (providerId: number) => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onEditProvider: (preset: ProviderPreset) => void
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
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const baseURLInputRef = useRef<HTMLInputElement | null>(null)
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null)
  const hasPrimaryFieldError = Boolean(
    providerForm.errors.name ||
      providerForm.errors.baseURL ||
      providerForm.errors.apiKey,
  )
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
      <ProviderSourceSummaryCard
        activePreset={activePreset}
        providerState={providerState}
      />

      <div
        className="grid min-h-0 gap-6 lg:grid-cols-[minmax(16rem,18.75rem)_minmax(0,1fr)]"
        data-testid="provider-settings-layout"
      >
        <ProviderPresetList
          editingProviderId={editingProviderId}
          isLoadingProviders={isLoadingProviders}
          isSavingProvider={isSavingProvider}
          onActivateProvider={onActivateProvider}
          onDeleteProvider={onDeleteProvider}
          onEditProvider={onEditProvider}
          onStartNewProvider={onStartNewProvider}
          providerState={providerState}
        />

        <ProviderEditorForm
          apiKeyInputRef={apiKeyInputRef}
          baseURLInputRef={baseURLInputRef}
          canReuseActiveAPIKey={canReuseActiveAPIKey}
          editingProviderId={editingProviderId}
          hasPrimaryFieldError={hasPrimaryFieldError}
          nameInputRef={nameInputRef}
          onProviderFieldChange={onProviderFieldChange}
          onProviderModelsChange={onProviderModelsChange}
          onResetProvider={onResetProvider}
          providerForm={providerForm}
          providerState={providerState}
        />
      </div>
    </div>
  )
}
