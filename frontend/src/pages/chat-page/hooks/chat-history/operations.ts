import { chatApi } from '../../../../lib/api'
import type { Conversation } from '../../../../types/chat'
import {
  clearLastConversationId,
  isConversationNotFoundError,
} from '../../utils'
import { resolveConversationForList, wait } from '../chat-session-helpers'
import {
  hasStreamingAssistantMessage,
  mergeOlderHistoryMessages,
  resolveHistoryPagination,
} from './helpers'
import type {
  ChatHistoryOperationContext,
  ReconcileConversationOptions,
} from './types'

const STOP_RECONCILE_ATTEMPTS = 12
const STOP_RECONCILE_DELAY_MS = 150
const MESSAGE_PAGE_SIZE = 50

export function createChatHistoryOperations(
  context: ChatHistoryOperationContext,
) {
  async function reconcileConversationState(
    conversationId: Conversation['id'],
    {
      clearErrorOnSuccess = true,
      preserveMessages = [],
    }: ReconcileConversationOptions = {},
  ) {
    try {
      const response = await chatApi.getConversationMessages(conversationId)
      context.applyConversationSnapshot(
        response,
        context.activeConversationIdRef.current === conversationId,
        preserveMessages,
      )

      if (clearErrorOnSuccess) {
        context.setChatError(null)
      }

      return response
    } catch (error) {
      if (isConversationNotFoundError(error)) {
        clearLastConversationId(conversationId)
        if (context.activeConversationIdRef.current === conversationId) {
          context.setSkipAutoResumeRef.current(true)
          context.activeConversationIdRef.current = null
          context.setMessages([])
          context.navigateHomeRef.current(true)
        }
      }

      return null
    }
  }

  async function loadOlderMessages() {
    if (
      !context.activeConversationId ||
      !context.hasMoreMessagesRef.current ||
      !context.nextBeforeMessageIdRef.current ||
      context.isLoadingOlderMessagesRef.current
    ) {
      return
    }

    const viewport = context.messageViewportRef.current
    const previousScrollHeight = viewport?.scrollHeight ?? 0

    context.setIsLoadingOlderMessages(true)
    context.setChatError(null)

    try {
      const response = await chatApi.getConversationMessages(
        context.activeConversationId,
        {
          beforeId: context.nextBeforeMessageIdRef.current,
          limit: MESSAGE_PAGE_SIZE,
        },
      )

      context.setMessages((previous) =>
        mergeOlderHistoryMessages(response.messages, previous),
      )
      context.setPendingConversation(response.conversation)
      context.syncConversationIntoListRef.current(
        resolveConversationForList(response.conversation),
        { updateCountsForVisibilityChange: false },
      )

      const pagination = resolveHistoryPagination(response)
      context.setHasMoreMessages(pagination.hasMoreMessages)
      context.setNextBeforeMessageId(pagination.nextBeforeMessageId)

      window.requestAnimationFrame(() => {
        const nextViewport = context.messageViewportRef.current
        if (!nextViewport) {
          return
        }

        const heightDelta = nextViewport.scrollHeight - previousScrollHeight
        nextViewport.scrollTop += heightDelta
      })
    } catch (error) {
      context.setChatError(
        error instanceof Error
          ? error.message
          : context.tRef.current('error.loadMessages'),
      )
    } finally {
      context.setIsLoadingOlderMessages(false)
    }
  }

  async function waitForConversationToSettle(
    conversationId: Conversation['id'],
    { clearErrorOnSuccess = true }: { clearErrorOnSuccess?: boolean } = {},
  ) {
    let latestResponse: Awaited<ReturnType<typeof reconcileConversationState>> =
      null

    for (let attempt = 0; attempt < STOP_RECONCILE_ATTEMPTS; attempt += 1) {
      const response = await reconcileConversationState(conversationId, {
        clearErrorOnSuccess,
      })
      if (!response) {
        return latestResponse
      }

      latestResponse = response
      if (!hasStreamingAssistantMessage(response.messages)) {
        return response
      }

      await wait(STOP_RECONCILE_DELAY_MS)
    }

    return latestResponse
  }

  function resetHistoryState() {
    context.setMessages([])
    context.setHasMoreMessages(false)
    context.setNextBeforeMessageId(null)
    context.setIsLoadingOlderMessages(false)
    context.setIsSending(false)
  }

  return {
    reconcileConversationState,
    loadOlderMessages,
    waitForConversationToSettle,
    resetHistoryState,
  }
}
