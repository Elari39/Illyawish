import type {
  CreateProviderPayload,
  TestProviderPayload,
  UpdateProviderPayload,
} from '../../../../types/chat'
import type { ProviderEditorMode, ProviderFormState } from '../../types'
import {
  canReuseActivePresetAPIKey,
  normalizeModelEntries,
} from '../../utils'

interface ProviderPayloadOptions {
  providerForm: ProviderFormState
  providerEditorMode: ProviderEditorMode
  providerState: Parameters<typeof canReuseActivePresetAPIKey>[0]
  defaultModel: string
}

export type ProviderSaveRequest =
  | {
      mode: 'create'
      payload: CreateProviderPayload
    }
  | {
      mode: 'update'
      providerId: number
      payload: UpdateProviderPayload
    }

function resolveSubmittedAPIKey(apiKey: string) {
  const trimmedAPIKey = apiKey.trim()
  return trimmedAPIKey || undefined
}

function shouldReuseActiveAPIKey({
  providerEditorMode,
  providerState,
  nextAPIKey,
}: {
  providerEditorMode: ProviderEditorMode
  providerState: Parameters<typeof canReuseActivePresetAPIKey>[0]
  nextAPIKey?: string
}) {
  return (
    providerEditorMode.type !== 'edit' &&
    canReuseActivePresetAPIKey(providerState) &&
    !nextAPIKey
  )
}

export function buildProviderSaveRequest({
  providerForm,
  providerEditorMode,
  providerState,
  defaultModel,
}: ProviderPayloadOptions): ProviderSaveRequest {
  const models = normalizeModelEntries(providerForm.models)
  const nextAPIKey = resolveSubmittedAPIKey(providerForm.apiKey)
  const reuseActiveApiKey = shouldReuseActiveAPIKey({
    providerEditorMode,
    providerState,
    nextAPIKey,
  })

  if (providerEditorMode.type === 'edit') {
    return {
      mode: 'update',
      providerId: providerEditorMode.providerId,
      payload: {
        format: providerForm.format,
        name: providerForm.name,
        baseURL: providerForm.baseURL,
        models,
        defaultModel,
        ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
      },
    }
  }

  return {
    mode: 'create',
    payload: {
      format: providerForm.format,
      name: providerForm.name,
      baseURL: providerForm.baseURL,
      ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
      ...(reuseActiveApiKey ? { reuseActiveApiKey: true } : {}),
      models,
      defaultModel,
    },
  }
}

export function buildProviderTestRequest({
  providerForm,
  providerEditorMode,
  providerState,
  defaultModel,
}: ProviderPayloadOptions): TestProviderPayload {
  const nextAPIKey = resolveSubmittedAPIKey(providerForm.apiKey)
  const reuseActiveApiKey = shouldReuseActiveAPIKey({
    providerEditorMode,
    providerState,
    nextAPIKey,
  })

  return {
    ...(providerEditorMode.type === 'edit'
      ? { providerId: providerEditorMode.providerId }
      : {}),
    format: providerForm.format,
    baseURL: providerForm.baseURL,
    ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
    ...(reuseActiveApiKey ? { reuseActiveApiKey: true } : {}),
    defaultModel,
  }
}
