import type { Dispatch, SetStateAction } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import type {
  Conversation,
  ConversationSettings,
} from '../../../types/chat'
import { parseConversationTagsInput } from '../conversation-list-utils'
import {
  decodeProviderModelValue,
  resolveEffectiveProviderModel,
} from '../provider-model-utils'
import { clearLastConversationId } from '../utils'
import type { useAgentWorkspace } from './use-agent-workspace'
import type { useChatSession } from './use-chat-session'
import type { useChatUIState } from './use-chat-ui-state'
import type { useConversationList } from './use-conversation-list'
import type { useProviderSettings } from './use-provider-settings'

type ConversationListController = ReturnType<typeof useConversationList>
type ChatSessionController = ReturnType<typeof useChatSession>
type ProviderSettingsController = ReturnType<typeof useProviderSettings>
type AgentWorkspaceController = ReturnType<typeof useAgentWorkspace>
type ChatUIStateController = ReturnType<typeof useChatUIState>

interface UseChatPageActionsOptions {
  activeConversationId: Conversation['id'] | null
  currentConversation: Conversation | null
  contextBarSettings: ConversationSettings
  interactionDisabled: boolean
  conversationList: ConversationListController
  chatSession: ChatSessionController
  providerSettings: ProviderSettingsController
  agentWorkspace: AgentWorkspaceController
  uiState: ChatUIStateController
  navigate: (to: string, options?: { replace?: boolean }) => void
  navigateHome: (replace?: boolean) => void
  logout: () => Promise<void>
  setIsSavingSettings: Dispatch<SetStateAction<boolean>>
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
}

export function useChatPageActions({
  activeConversationId,
  currentConversation,
  contextBarSettings,
  interactionDisabled,
  conversationList,
  chatSession,
  providerSettings,
  agentWorkspace,
  uiState,
  navigate,
  navigateHome,
  logout,
  setIsSavingSettings,
  setChatError,
  t,
}: UseChatPageActionsOptions) {
  function handleOpenSettings(tab: Parameters<typeof uiState.setActiveSettingsTab>[0] = 'chat') {
    uiState.setActiveSettingsTab(tab)
    chatSession.syncSettingsDraft()
    uiState.setIsSettingsOpen(true)
  }

  function handleCreateNewChat() {
    if (interactionDisabled) {
      return
    }
    conversationList.setSkipAutoResume(true)
    uiState.setSidebarOpen(false)
    conversationList.setShowArchived(false)
    chatSession.resetForNewChat()
    navigateHome()
  }

  function handleDeleteConversation(conversationId: Conversation['id']) {
    if (interactionDisabled) {
      return
    }

    uiState.setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteConversation'),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await chatApi.deleteConversation(conversationId)
          conversationList.removeConversationFromList(conversationId)
          clearLastConversationId(conversationId)
          if (activeConversationId === conversationId) {
            conversationList.setSkipAutoResume(true)
            chatSession.resetForNewChat()
            navigateHome(true)
          }
          uiState.showToast(t('common.delete'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.deleteConversation'),
          )
        }
      },
    })
  }

  function handleRenameConversation(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    uiState.setPromptState({
      title: t('prompt.renameConversation'),
      initialValue: conversation.title,
      confirmLabel: t('sidebar.rename'),
      onSubmit: async (nextTitle) => {
        try {
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            title: nextTitle,
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.rename'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.renameConversation'),
          )
        }
      },
    })
  }

  async function handleTogglePinned(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    try {
      const updatedConversation = await chatApi.updateConversation(conversation.id, {
        isPinned: !conversation.isPinned,
      })
      conversationList.syncConversationIntoList(updatedConversation)
      uiState.showToast(
        conversation.isPinned ? t('sidebar.unpin') : t('sidebar.pin'),
        'success',
      )
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.updateConversation'),
      )
    }
  }

  async function handleToggleArchived(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    try {
      const nextArchived = !conversation.isArchived
      const updatedConversation = await chatApi.updateConversation(conversation.id, {
        isArchived: nextArchived,
      })

      conversationList.syncConversationIntoList(updatedConversation)

      if (activeConversationId === conversation.id && nextArchived !== conversationList.showArchived) {
        clearLastConversationId(conversation.id)
        conversationList.setSkipAutoResume(true)
        chatSession.resetForNewChat()
        navigateHome(true)
      }

      uiState.showToast(
        nextArchived ? t('sidebar.archive') : t('sidebar.restore'),
        'success',
      )
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.archiveConversation'),
      )
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

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
      const updatedConversation = await chatApi.updateConversation(activeConversationId, {
        settings: {
          ...contextBarSettings,
          providerPresetId: nextSelection.providerPresetId,
          model: nextSelection.model,
        },
      })
      conversationList.syncConversationIntoList(updatedConversation)
      chatSession.setSettingsDraft(updatedConversation.settings)
      uiState.showToast(nextSelection.model, 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.saveSettings'),
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
        error instanceof Error
          ? error.message
          : t('error.saveSettings'),
      )
    }
  }

  function handleDeleteProvider(conversation: Parameters<typeof providerSettings.handleDeleteProvider>[0]) {
    uiState.setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteProviderPreset', { name: conversation.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        await providerSettings.handleDeleteProvider(conversation)
      },
    })
  }

  async function handleDeleteWorkflowPreset(presetId: number) {
    const preset = agentWorkspace.workflowPresets.find((entry) => entry.id === presetId)
    if (!preset) {
      return false
    }

    uiState.setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteWorkflowPreset', { name: preset.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        const deleted = await agentWorkspace.deleteWorkflowPreset(presetId)
        if (!deleted) {
          return
        }

        if (chatSession.workflowPresetIdDraft === presetId) {
          chatSession.setWorkflowPresetIdDraft(null)
        }

        if (currentConversation?.workflowPresetId === presetId) {
          try {
            const updatedConversation = await chatApi.updateConversation(currentConversation.id, {
              workflowPresetId: null,
            })
            conversationList.syncConversationIntoList(updatedConversation)
          } catch (error) {
            setChatError(
              error instanceof Error
                ? error.message
                : t('error.updateWorkflowPresetSelection'),
            )
          }
        }
      },
    })

    return false
  }

  function handleMoveConversationToFolder(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    uiState.setPromptState({
      title: t('sidebar.moveToFolder'),
      initialValue: conversation.folder,
      confirmLabel: t('sidebar.moveToFolder'),
      onSubmit: async (value) => {
        try {
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            folder: value.trim(),
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.moveToFolder'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.updateConversation'),
          )
        }
      },
    })
  }

  function handleAddConversationTags(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    uiState.setPromptState({
      title: t('sidebar.addTags'),
      initialValue: '',
      confirmLabel: t('sidebar.addTags'),
      onSubmit: async (value) => {
        try {
          const tagsToAdd = parseConversationTagsInput(value)
          if (tagsToAdd.length === 0) {
            return
          }
          const nextTags = Array.from(new Set([...conversation.tags, ...tagsToAdd]))
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            tags: nextTags,
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.addTags'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.updateConversation'),
          )
        }
      },
    })
  }

  function handleRemoveConversationTags(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    uiState.setPromptState({
      title: t('sidebar.removeTags'),
      initialValue: '',
      confirmLabel: t('sidebar.removeTags'),
      onSubmit: async (value) => {
        try {
          const tagsToRemove = parseConversationTagsInput(value).map((tag) => tag.toLowerCase())
          if (tagsToRemove.length === 0) {
            return
          }
          const nextTags = conversation.tags.filter(
            (tag) => !tagsToRemove.includes(tag.toLowerCase()),
          )
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            tags: nextTags,
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.removeTags'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.updateConversation'),
          )
        }
      },
    })
  }

  async function runBulkConversationUpdate(
    buildPayload: (conversation: Conversation, value: string) => Parameters<typeof chatApi.updateConversation>[1],
    value: string,
  ) {
    const selectedConversations = conversationList.conversations.filter((conversation) =>
      conversationList.selectedConversationIds.includes(conversation.id),
    )

    let successCount = 0
    let failureCount = 0

    for (const conversation of selectedConversations) {
      try {
        const updatedConversation = await chatApi.updateConversation(
          conversation.id,
          buildPayload(conversation, value),
        )
        conversationList.syncConversationIntoList(updatedConversation)
        successCount += 1
      } catch {
        failureCount += 1
      }
    }

    conversationList.clearSelectedConversations()
    if (successCount > 0) {
      uiState.showToast(
        failureCount > 0
          ? t('sidebar.bulkUpdatePartial', { successCount, failureCount })
          : t('sidebar.bulkUpdateSuccess', { count: successCount }),
        failureCount > 0 ? 'info' : 'success',
      )
    }
    if (failureCount > 0) {
      setChatError(t('error.updateConversation'))
    }
  }

  function handleBulkMoveToFolder() {
    uiState.setPromptState({
      title: t('sidebar.moveSelected'),
      initialValue: '',
      confirmLabel: t('sidebar.moveSelected'),
      onSubmit: async (value) => {
        await runBulkConversationUpdate(
          (_conversation, nextValue) => ({ folder: nextValue.trim() }),
          value,
        )
      },
    })
  }

  function handleBulkAddTags() {
    uiState.setPromptState({
      title: t('sidebar.addTagsSelected'),
      initialValue: '',
      confirmLabel: t('sidebar.addTagsSelected'),
      onSubmit: async (value) => {
        await runBulkConversationUpdate(
          (conversation, nextValue) => {
            const tagsToAdd = parseConversationTagsInput(nextValue)
            return {
              tags: Array.from(new Set([...conversation.tags, ...tagsToAdd])),
            }
          },
          value,
        )
      },
    })
  }

  function handleBulkRemoveTags() {
    uiState.setPromptState({
      title: t('sidebar.removeTagsSelected'),
      initialValue: '',
      confirmLabel: t('sidebar.removeTagsSelected'),
      onSubmit: async (value) => {
        await runBulkConversationUpdate(
          (conversation, nextValue) => {
            const tagsToRemove = parseConversationTagsInput(nextValue).map((tag) => tag.toLowerCase())
            return {
              tags: conversation.tags.filter(
                (tag) => !tagsToRemove.includes(tag.toLowerCase()),
              ),
            }
          },
          value,
        )
      },
    })
  }

  async function handleImportConversation(file: File) {
    await chatSession.handleImportConversation(file)
    uiState.setIsSettingsOpen(false)
  }

  return {
    handleOpenSettings,
    handleCreateNewChat,
    handleDeleteConversation,
    handleRenameConversation,
    handleTogglePinned,
    handleToggleArchived,
    handleLogout,
    handleSaveSettings,
    handleProviderModelChange,
    handleSetDefaultProviderModel,
    handleDeleteProvider,
    handleDeleteWorkflowPreset,
    handleMoveConversationToFolder,
    handleAddConversationTags,
    handleRemoveConversationTags,
    handleBulkMoveToFolder,
    handleBulkAddTags,
    handleBulkRemoveTags,
    handleImportConversation,
  }
}
