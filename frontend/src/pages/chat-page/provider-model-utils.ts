import type { ChatSettings, ConversationSettings, ProviderPreset, ProviderState } from '../../types/chat'
import { normalizeModelEntries } from './provider-form-utils'

export interface ProviderModelOption {
  value: string
  providerPresetId: number
  providerName: string
  model: string
  label: string
}

export function encodeProviderModelValue(providerPresetId: number, model: string) {
  return `${providerPresetId}::${model}`
}

export function decodeProviderModelValue(value: string) {
  const [providerPresetId, ...rest] = value.split('::')
  const model = rest.join('::').trim()
  const parsedProviderPresetId = Number(providerPresetId)

  if (!Number.isFinite(parsedProviderPresetId) || parsedProviderPresetId <= 0 || !model) {
    return null
  }

  return {
    providerPresetId: parsedProviderPresetId,
    model,
  }
}

export function buildProviderModelOptions(providerState: ProviderState | null) {
  if (!providerState) {
    return []
  }

  const modelCounts = new Map<string, number>()

  for (const preset of providerState.presets) {
    const models = resolveProviderModelList(preset)
    for (const model of models) {
      modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
    }
  }

  const options: ProviderModelOption[] = []

  for (const preset of providerState.presets) {
    const models = resolveProviderModelList(preset)
    for (const model of models) {
      const label = (modelCounts.get(model) ?? 0) > 1
        ? `${preset.name} · ${model}`
        : model

      options.push({
        value: encodeProviderModelValue(preset.id, model),
        providerPresetId: preset.id,
        providerName: preset.name,
        model,
        label,
      })
    }
  }

  return options
}

export function findProviderPreset(
  providerState: ProviderState | null,
  providerPresetId: number | null | undefined,
) {
  if (!providerState || providerPresetId == null) {
    return null
  }

  return providerState.presets.find((preset) => preset.id === providerPresetId) ?? null
}

export function resolveEffectiveProviderPresetId(
  providerState: ProviderState | null,
  conversationSettings: Pick<ConversationSettings, 'providerPresetId'> | null | undefined,
  chatSettings: Pick<ChatSettings, 'providerPresetId'> | null | undefined,
) {
  const preferredPresetId = conversationSettings?.providerPresetId ?? null
  if (preferredPresetId != null) {
    return preferredPresetId
  }

  const defaultPresetId = chatSettings?.providerPresetId ?? null
  if (defaultPresetId != null) {
    return defaultPresetId
  }

  return providerState?.activePresetId ?? null
}

export function resolveEffectiveProviderModel(
  providerState: ProviderState | null,
  conversationSettings: Pick<ConversationSettings, 'providerPresetId' | 'model'> | null | undefined,
  chatSettings: Pick<ChatSettings, 'providerPresetId' | 'model'> | null | undefined,
) {
  const providerPresetId = resolveEffectiveProviderPresetId(
    providerState,
    conversationSettings,
    chatSettings,
  )
  const preset = findProviderPreset(providerState, providerPresetId)
  const model = [
    conversationSettings?.model?.trim() ?? '',
    chatSettings?.model?.trim() ?? '',
    preset?.defaultModel?.trim() ?? '',
  ].find((value) => value.length > 0) ?? ''

  return {
    providerPresetId,
    preset,
    model,
    value:
      providerPresetId != null && model
        ? encodeProviderModelValue(providerPresetId, model)
        : '',
  }
}

export function resolveModelsForProvider(
  providerState: ProviderState | null,
  providerPresetId: number | null | undefined,
  currentModel: string,
) {
  const preset = findProviderPreset(providerState, providerPresetId)
  const models = preset ? resolveProviderModelList(preset) : []
  const trimmedCurrentModel = currentModel.trim()

  if (trimmedCurrentModel && !models.includes(trimmedCurrentModel)) {
    return [trimmedCurrentModel, ...models]
  }

  return models
}

function resolveProviderModelList(preset: ProviderPreset) {
  const normalizedModels = normalizeModelEntries(preset.models)
  if (normalizedModels.length > 0) {
    return normalizedModels
  }

  const defaultModel = preset.defaultModel.trim()
  return defaultModel ? [defaultModel] : []
}
