import type { I18nContextValue } from '../../../i18n/context'
import type {
  ProviderFormat,
  ProviderPreset,
  ProviderState,
} from '../../../types/chat'
import type {
  ProviderEditorMode,
  ProviderFormState,
} from '../types'
import { PROVIDER_DEFAULT_BASE_URLS } from '../types'
import {
  createProviderFormErrors,
  normalizeModelEntries,
  resolveDefaultModelValue,
  resolveProviderModelDraft,
} from './models'

export function normalizeProviderFormat(value?: string): ProviderFormat {
  if (value === 'anthropic' || value === 'gemini') {
    return value
  }
  return 'openai'
}

export function defaultBaseURLForProviderFormat(format: ProviderFormat) {
  return PROVIDER_DEFAULT_BASE_URLS[format]
}

export function createProviderForm(
  fallback?: ProviderState['fallback'],
  preset?: ProviderPreset | null,
): ProviderFormState {
  if (preset) {
    const format = normalizeProviderFormat(preset.format)
    return {
      name: preset.name,
      format,
      baseURL: preset.baseURL,
      apiKey: '',
      models: resolveProviderModelDraft(preset.models, preset.defaultModel),
      defaultModel: preset.defaultModel,
      errors: createProviderFormErrors(),
    }
  }

  const fallbackModels = resolveProviderModelDraft(
    fallback?.models ?? [],
    fallback?.defaultModel ?? '',
  )
  const fallbackDefaultModel = resolveDefaultModelValue(
    fallbackModels,
    fallback?.defaultModel ?? '',
  )
  const fallbackFormat = normalizeProviderFormat(fallback?.format)

  return {
    name: '',
    format: fallbackFormat,
    baseURL:
      fallback?.baseURL || defaultBaseURLForProviderFormat(fallbackFormat),
    apiKey: '',
    models: fallbackModels.length > 0 ? fallbackModels : [''],
    defaultModel: fallbackDefaultModel,
    errors: createProviderFormErrors(),
  }
}

function areModelListsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function mergeNewProviderFormWithFallback(
  currentForm: ProviderFormState,
  previousFallback?: ProviderState['fallback'],
  nextFallback?: ProviderState['fallback'],
) {
  const previousForm = createProviderForm(previousFallback)
  const nextForm = createProviderForm(nextFallback)

  return {
    ...currentForm,
    format:
      currentForm.format === previousForm.format
        ? nextForm.format
        : currentForm.format,
    baseURL:
      currentForm.baseURL === previousForm.baseURL
        ? nextForm.baseURL
        : currentForm.baseURL,
    models:
      areModelListsEqual(currentForm.models, previousForm.models)
        ? nextForm.models
        : currentForm.models,
    defaultModel:
      currentForm.defaultModel === previousForm.defaultModel
        ? nextForm.defaultModel
        : currentForm.defaultModel,
    errors: currentForm.errors,
  }
}

export function resolveProviderEditorState(
  providerState: ProviderState,
  preferredMode: ProviderEditorMode,
) {
  const activePreset =
    providerState.presets.find((preset) => preset.isActive) ?? null

  if (preferredMode.type === 'new') {
    return {
      editingProviderId: null,
      providerEditorMode: preferredMode,
      providerForm: createProviderForm(providerState.fallback),
    }
  }

  if (preferredMode.type === 'edit') {
    const preferredPreset =
      providerState.presets.find(
        (preset) => preset.id === preferredMode.providerId,
      ) ?? null
    if (preferredPreset) {
      return {
        editingProviderId: preferredPreset.id,
        providerEditorMode: preferredMode,
        providerForm: createProviderForm(providerState.fallback, preferredPreset),
      }
    }
  }

  const nextPreset = activePreset

  return {
    editingProviderId: nextPreset?.id ?? null,
    providerEditorMode: nextPreset
      ? ({
          type: 'edit',
          providerId: nextPreset.id,
        } as const)
      : ({ type: 'auto' } as const),
    providerForm: createProviderForm(providerState.fallback, nextPreset),
  }
}

export function canReuseActivePresetAPIKey(
  providerState: ProviderState | null,
) {
  if (!providerState || providerState.activePresetId == null) {
    return false
  }

  const activePreset = providerState.presets.find(
    (preset) => preset.id === providerState.activePresetId,
  )
  return activePreset?.hasApiKey === true
}

export function describeProviderSource(
  providerState: ProviderState | null,
  activePreset: ProviderPreset | null,
  t: I18nContextValue['t'],
) {
  if (!providerState) {
    return t('provider.loadingStatus')
  }

  if (providerState.currentSource === 'preset' && activePreset) {
    return t('provider.usingPreset', {
      name: activePreset.name,
      model: activePreset.defaultModel,
    })
  }

  if (providerState.currentSource === 'fallback') {
    return providerState.fallback.available
      ? t('provider.usingFallbackModel', {
          model: providerState.fallback.defaultModel,
        })
      : t('provider.usingFallback')
  }

  return t('provider.notConfigured')
}

export function resolveChatModelOptions(
  providerState: ProviderState | null,
  currentModel: string,
) {
  const activePreset =
    providerState?.presets.find((preset) => preset.isActive) ?? null
  const sourceModels = activePreset?.models ?? providerState?.fallback.models ?? []
  const normalizedModels = normalizeModelEntries(sourceModels)
  const trimmedCurrentModel = currentModel.trim()

  if (
    trimmedCurrentModel &&
    !normalizedModels.includes(trimmedCurrentModel)
  ) {
    return [trimmedCurrentModel, ...normalizedModels]
  }

  return normalizedModels
}
