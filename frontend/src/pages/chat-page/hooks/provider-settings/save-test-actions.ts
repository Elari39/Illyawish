import { providerApi } from '../../../../lib/api'
import {
  canReuseActivePresetAPIKey,
  hasProviderFormErrors,
  validateProviderForm,
} from '../../utils'
import {
  buildProviderSaveRequest,
  buildProviderTestRequest,
} from './save-test-helpers'
import type {
  ProviderMutationValidation,
  ProviderSaveTestActionOptions,
} from './types'

function resolveProviderMutationValidation({
  providerState,
  providerForm,
  providerEditorModeRef,
  setProviderForm,
  t,
}: Pick<
  ProviderSaveTestActionOptions,
  'providerState' | 'providerForm' | 'providerEditorModeRef' | 'setProviderForm' | 't'
>): ProviderMutationValidation | null {
  const currentProviderEditorMode = providerEditorModeRef.current
  const canReuseActiveAPIKey =
    currentProviderEditorMode.type !== 'edit' &&
    canReuseActivePresetAPIKey(providerState)

  const validation = validateProviderForm(providerForm, {
    requireAPIKey:
      currentProviderEditorMode.type !== 'edit' && !canReuseActiveAPIKey,
    t,
  })

  if (hasProviderFormErrors(validation.errors)) {
    setProviderForm((previous) => ({
      ...previous,
      errors: validation.errors,
    }))
    return null
  }

  return {
    defaultModel: validation.defaultModel,
    normalizedModels: validation.normalizedModels,
  }
}

export function createProviderSaveTestActions({
  providerState,
  providerForm,
  providerEditorModeRef,
  setProviderForm,
  setIsSavingProvider,
  setIsTestingProvider,
  setChatError,
  showToast,
  t,
  applyProviderState,
}: ProviderSaveTestActionOptions) {
  async function handleSaveProvider() {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const currentProviderEditorMode = providerEditorModeRef.current
      const validation = resolveProviderMutationValidation({
        providerState,
        providerForm,
        providerEditorModeRef,
        setProviderForm,
        t,
      })
      if (!validation) {
        return
      }

      const request = buildProviderSaveRequest({
        providerForm: {
          ...providerForm,
          models: validation.normalizedModels,
        },
        providerEditorMode: currentProviderEditorMode,
        providerState,
        defaultModel: validation.defaultModel,
      })
      const nextState =
        request.mode === 'update'
          ? await providerApi.update(request.providerId, request.payload)
          : await providerApi.create(request.payload)

      const nextProviderEditorMode =
        currentProviderEditorMode.type === 'edit'
          ? currentProviderEditorMode
          : nextState.activePresetId != null
            ? {
                type: 'edit' as const,
                providerId: nextState.activePresetId,
              }
            : { type: 'auto' as const }

      applyProviderState(nextState, nextProviderEditorMode)
      showToast(
        currentProviderEditorMode.type === 'edit'
          ? t('settings.savePreset')
          : t('settings.createPreset'),
        'success',
      )
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.saveProviderSettings'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function handleTestProvider() {
    setIsTestingProvider(true)
    setChatError(null)

    try {
      const validation = resolveProviderMutationValidation({
        providerState,
        providerForm,
        providerEditorModeRef,
        setProviderForm,
        t,
      })
      if (!validation) {
        return
      }

      const result = await providerApi.test(
        buildProviderTestRequest({
          providerForm: {
            ...providerForm,
            models: validation.normalizedModels,
          },
          providerEditorMode: providerEditorModeRef.current,
          providerState,
          defaultModel: validation.defaultModel,
        }),
      )
      showToast(result.message, 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.saveProviderSettings'),
      )
    } finally {
      setIsTestingProvider(false)
    }
  }

  return {
    handleSaveProvider,
    handleTestProvider,
  }
}
