import { chatApi } from '../../../../lib/api'
import {
  decodeProviderModelValue,
  resolveEffectiveProviderModel,
} from '../../provider-model-utils'
import type { UseChatPageActionsOptions } from './types'

export function createProviderActionHandlers({
  activeConversationId,
  contextBarSettings,
  conversationList,
  chatSession,
  providerSettings,
  uiState,
  navigate,
  setIsSavingSettings,
  setChatError,
  t,
}: Pick<
  UseChatPageActionsOptions,
  | 'activeConversationId'
  | 'contextBarSettings'
  | 'conversationList'
  | 'chatSession'
  | 'providerSettings'
  | 'uiState'
  | 'navigate'
  | 'setIsSavingSettings'
  | 'setChatError'
  | 't'
>) {
  async function handleSaveSettings() {
    setIsSavingSettings(true)
    setChatError(null)

    try {
      await chatSession.handleSaveSettings(() => {
        uiState.setIsSettingsOpen(false)
      })
    } finally {
      setIsSavingSettings(false)
    }
  }

  async function handleProviderModelChange(value: string) {
    const nextSelection = decodeProviderModelValue(value)
    if (!nextSelection) {
      return
    }

    if (!activeConversationId) {
      chatSession.setSettingsDraft((previous) => ({
        ...previous,
        providerPresetId: nextSelection.providerPresetId,
        model: nextSelection.model,
      }))
      return
    }

    try {
      const updatedConversation = await chatApi.updateConversation(
        activeConversationId,
        {
          settings: {
            ...contextBarSettings,
            providerPresetId: nextSelection.providerPresetId,
            model: nextSelection.model,
          },
        },
      )
      conversationList.syncConversationIntoList(updatedConversation)
      chatSession.setSettingsDraft(updatedConversation.settings)
      uiState.showToast(nextSelection.model, 'success')
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.saveSettings'),
      )
    }
  }

  async function handleSetDefaultProviderModel() {
    const selection = resolveEffectiveProviderModel(
      providerSettings.providerState,
      contextBarSettings,
      chatSession.chatSettingsDraft,
    )

    if (selection.providerPresetId == null || selection.model === '') {
      return
    }

    try {
      const updatedChatSettings = await chatApi.updateChatSettings({
        ...chatSession.chatSettingsDraft,
        providerPresetId: selection.providerPresetId,
        model: selection.model,
      })
      chatSession.applyChatSettings(updatedChatSettings)
      uiState.showToast(t('chatContext.setAsDefault'), 'success')
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.saveSettings'),
      )
    }
  }

  function handleDeleteProvider(
    preset: Parameters<typeof providerSettings.handleDeleteProvider>[0],
  ) {
    uiState.setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteProviderPreset', { name: preset.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        await providerSettings.handleDeleteProvider(preset)
      },
    })
  }

  async function handleLogout() {
    navigate('/login', { replace: true })
  }

  return {
    handleSaveSettings,
    handleProviderModelChange,
    handleSetDefaultProviderModel,
    handleDeleteProvider,
    handleNavigateToLogin: handleLogout,
  }
}
