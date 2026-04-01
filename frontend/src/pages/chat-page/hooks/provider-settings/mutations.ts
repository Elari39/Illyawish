import { providerApi } from '../../../../lib/api'
import type { ProviderPreset, ProviderState } from '../../../../types/chat'
import type { ProviderEditorMode } from '../../types'
import { createProviderEditorActions } from './editor-actions'
import { createProviderSaveTestActions } from './save-test-actions'
import {
  applyProviderState as applyProviderStateToEditor,
  applyResolvedProviderEditorState,
  mergeFormWithFetchedProviderState,
} from './state-apply'
import type {
  ProviderEditorTarget,
  ProviderSettingsMutationOptions,
} from './types'

export function createProviderSettingsMutations({
  providerState,
  providerForm,
  editingProviderId,
  providerStateRef,
  providerEditorModeRef,
  setProviderState,
  setProviderForm,
  setEditingProviderId,
  setProviderEditorMode,
  setIsSavingProvider,
  setIsTestingProvider,
  setChatError,
  showToast,
  t,
}: ProviderSettingsMutationOptions) {
  function applyResolvedProviderEditor(nextProviderEditor: ProviderEditorTarget) {
    applyResolvedProviderEditorState(
      {
        providerEditorModeRef,
        setProviderEditorMode,
        setEditingProviderId,
        setProviderForm,
        providerStateRef,
        setProviderState,
      },
      nextProviderEditor,
    )
  }

  function applyProviderState(
    nextState: ProviderState,
    preferredMode: ProviderEditorMode = providerEditorModeRef.current,
  ) {
    applyProviderStateToEditor(
      {
        providerStateRef,
        providerEditorModeRef,
        setProviderState,
        setProviderForm,
        setEditingProviderId,
        setProviderEditorMode,
      },
      nextState,
      preferredMode,
    )
  }

  function mergeFormWithFetchedState(
    previousState: ProviderState | null,
    nextState: ProviderState,
  ) {
    mergeFormWithFetchedProviderState(
      {
        providerStateRef,
        providerEditorModeRef,
        setProviderState,
        setProviderForm,
        setEditingProviderId,
        setProviderEditorMode,
      },
      previousState,
      nextState,
    )
  }

  const editorActions = createProviderEditorActions({
    providerState,
    providerStateRef,
    providerEditorModeRef,
    setProviderForm,
    setEditingProviderId,
    setProviderEditorMode,
    applyResolvedProviderEditor,
  })

  const saveTestActions = createProviderSaveTestActions({
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
  })

  async function handleActivateProvider(providerId: number) {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = await providerApi.activate(providerId)
      applyProviderState(nextState, {
        type: 'edit',
        providerId,
      })
      showToast(t('settings.setActive'), 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.activateProviderPreset'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function handleDeleteProvider(preset: ProviderPreset) {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = await providerApi.delete(preset.id)
      applyProviderState(
        nextState,
        editingProviderId === preset.id
          ? { type: 'auto' }
          : providerEditorModeRef.current,
      )
      showToast(t('common.delete'), 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.deleteProviderPreset'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  return {
    applyResolvedProviderEditor,
    mergeFormWithFetchedState,
    resetProviderEditorMode: editorActions.resetProviderEditorMode,
    handleStartNewProvider: editorActions.handleStartNewProvider,
    handleEditProvider: editorActions.handleEditProvider,
    handleProviderFieldChange: editorActions.handleProviderFieldChange,
    handleProviderModelsChange: editorActions.handleProviderModelsChange,
    handleSaveProvider: saveTestActions.handleSaveProvider,
    handleTestProvider: saveTestActions.handleTestProvider,
    handleActivateProvider,
    handleDeleteProvider,
  }
}
