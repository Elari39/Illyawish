import { chatApi } from '../../../../lib/api'
import type { Conversation } from '../../../../types/chat'
import { parseConversationTagsInput } from '../../conversation-list-utils'
import { clearLastConversationId } from '../../utils'
import type { UseChatPageActionsOptions } from './types'

export function createConversationActionHandlers({
  activeConversationId,
  interactionDisabled,
  conversationList,
  chatSession,
  uiState,
  navigateHome,
  logout,
  setChatError,
  t,
}: Pick<
  UseChatPageActionsOptions,
  | 'activeConversationId'
  | 'interactionDisabled'
  | 'conversationList'
  | 'chatSession'
  | 'uiState'
  | 'navigateHome'
  | 'logout'
  | 'setChatError'
  | 't'
>) {
  function handleOpenSettings(
    tab: Parameters<typeof uiState.setActiveSettingsTab>[0] = 'chat',
  ) {
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
          const updatedConversation = await chatApi.updateConversation(
            conversation.id,
            { title: nextTitle },
          )
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
      const updatedConversation = await chatApi.updateConversation(
        conversation.id,
        {
          isPinned: !conversation.isPinned,
        },
      )
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
      const updatedConversation = await chatApi.updateConversation(
        conversation.id,
        {
          isArchived: nextArchived,
        },
      )

      conversationList.syncConversationIntoList(updatedConversation)

      if (
        activeConversationId === conversation.id &&
        nextArchived !== conversationList.showArchived
      ) {
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
          const updatedConversation = await chatApi.updateConversation(
            conversation.id,
            {
              folder: value.trim(),
            },
          )
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
          const nextTags = Array.from(
            new Set([...conversation.tags, ...tagsToAdd]),
          )
          const updatedConversation = await chatApi.updateConversation(
            conversation.id,
            {
              tags: nextTags,
            },
          )
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
          const tagsToRemove = parseConversationTagsInput(value).map((tag) =>
            tag.toLowerCase(),
          )
          if (tagsToRemove.length === 0) {
            return
          }
          const nextTags = conversation.tags.filter(
            (tag) => !tagsToRemove.includes(tag.toLowerCase()),
          )
          const updatedConversation = await chatApi.updateConversation(
            conversation.id,
            {
              tags: nextTags,
            },
          )
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

  async function handleLogout() {
    await logout()
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
    handleMoveConversationToFolder,
    handleAddConversationTags,
    handleRemoveConversationTags,
    handleLogout,
    handleImportConversation,
  }
}
