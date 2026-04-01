import type { I18nContextValue } from '../../../i18n/context'
import type {
  ConversationSettings,
} from '../../../types/chat'
import type {
  ProviderFormErrors,
  ProviderFormState,
} from '../types'

export function createProviderFormErrors(): ProviderFormErrors {
  return {
    modelItems: [],
  }
}

export function normalizeModelEntries(models: string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const model of models) {
    const trimmed = model.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  return normalized
}

export function resolveDefaultModelValue(
  models: string[],
  defaultModel: string,
) {
  const normalizedModels = normalizeModelEntries(models)
  const trimmedDefaultModel = defaultModel.trim()

  if (normalizedModels.length === 0) {
    return ''
  }

  if (!trimmedDefaultModel) {
    return normalizedModels[0] ?? ''
  }
  if (normalizedModels.includes(trimmedDefaultModel)) {
    return trimmedDefaultModel
  }
  return normalizedModels[0] ?? trimmedDefaultModel
}

export function resolveProviderModelDraft(
  models: string[],
  defaultModel: string,
) {
  const normalizedModels = normalizeModelEntries(models)
  const trimmedDefaultModel = defaultModel.trim()

  if (!trimmedDefaultModel) {
    return normalizedModels.length > 0 ? normalizedModels : ['']
  }
  if (normalizedModels.includes(trimmedDefaultModel)) {
    return normalizedModels
  }
  return [trimmedDefaultModel, ...normalizedModels]
}

export function hasProviderFormErrors(errors: ProviderFormErrors) {
  return Boolean(
    errors.format ||
      errors.name ||
      errors.baseURL ||
      errors.apiKey ||
      errors.models ||
      errors.defaultModel ||
      errors.modelItems.some((message) => Boolean(message)),
  )
}

export function validateProviderForm(
  form: ProviderFormState,
  options: {
    requireAPIKey: boolean
    t: I18nContextValue['t']
  },
) {
  const errors = createProviderFormErrors()
  const { requireAPIKey, t } = options

  if (!form.format) {
    errors.format = t('settings.validationProviderFormatRequired')
  }

  if (!form.name.trim()) {
    errors.name = t('settings.validationPresetNameRequired')
  }
  if (!form.baseURL.trim()) {
    errors.baseURL = t('settings.validationBaseUrlRequired')
  }
  if (requireAPIKey && !form.apiKey.trim()) {
    errors.apiKey = t('settings.validationApiKeyRequired')
  }

  errors.modelItems = form.models.map((model) =>
    model.trim() ? '' : t('settings.validationModelRequired'),
  )

  const normalizedModels = normalizeModelEntries(form.models)
  const defaultModel = form.defaultModel.trim()

  if (normalizedModels.length === 0) {
    errors.models = t('settings.validationModelListRequired')
  }
  if (!defaultModel) {
    errors.defaultModel = t('settings.validationDefaultModelRequired')
  } else if (!normalizedModels.includes(defaultModel)) {
    errors.defaultModel = t('settings.validationDefaultModelInvalid')
  }

  return {
    defaultModel,
    errors,
    normalizedModels,
  }
}

export function mergeConversationSettings(
  previous: ConversationSettings,
  next: Partial<ConversationSettings>,
) {
  return {
    ...previous,
    ...next,
  }
}
