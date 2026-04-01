import { chatApi } from '../../../../lib/api'
import type { Conversation } from '../../../../types/chat'
import { parseConversationTagsInput } from '../../conversation-list-utils'
import type { UseChatPageActionsOptions } from './types'

export function createBulkActionHandlers({
  conversationList,
  uiState,
  setChatError,
  t,
}: Pick<
  UseChatPageActionsOptions,
  'conversationList' | 'uiState' | 'setChatError' | 't'
>) {
  async function runBulkConversationUpdate(
    buildPayload: (
      conversation: Conversation,
      value: string,
    ) => Parameters<typeof chatApi.updateConversation>[1],
    value: string,
  ) {
    const selectedConversations = conversationList.conversations.filter(
      (conversation) =>
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
            const tagsToRemove = parseConversationTagsInput(nextValue).map(
              (tag) => tag.toLowerCase(),
            )
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

  return {
    handleBulkMoveToFolder,
    handleBulkAddTags,
    handleBulkRemoveTags,
  }
}
