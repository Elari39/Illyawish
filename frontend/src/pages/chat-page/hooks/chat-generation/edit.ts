import type { Attachment } from '../../../../types/chat'
import { chatApi } from '../../../../lib/api'
import { createOptimisticAssistantMessage, markAssistantMessageAsFailed, resolveSavedGenerationSettings } from './helpers'
import {
  beginWorkflowGeneration,
  createStreamEventHandler,
  isStoppedGenerationAbort,
  settleWorkflowGenerationCleanup,
} from './shared'
import type { ChatGenerationWorkflowContext } from './types'

export function createEditSubmitHandler(context: ChatGenerationWorkflowContext) {
  return async function handleEditSubmit(
    conversationId: string,
    messageId: number,
    content: string,
    attachments: Attachment[],
  ) {
    context.setChatError(null)
    context.setIsSending(true)

    const optimisticAssistantId = -(Date.now() + 1)
    const optimisticAssistantMessage = createOptimisticAssistantMessage(
      conversationId,
      optimisticAssistantId,
    )
    const generation = beginWorkflowGeneration(
      context,
      conversationId,
      optimisticAssistantId,
    )
    const optimisticMessages = [
      ...context.messages
        .filter((message) => message.id <= messageId)
        .map((message) =>
          message.id === messageId
            ? {
                ...message,
                content,
                attachments,
                status: 'completed' as const,
              }
            : message,
        ),
      optimisticAssistantMessage,
    ]

    try {
      context.setMessages((previous) => {
        const updatedMessages = previous
          .filter((message) => message.id <= messageId)
          .map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content,
                  attachments,
                  status: 'completed' as const,
                }
              : message,
          )

        updatedMessages.push(optimisticAssistantMessage)
        return updatedMessages
      })

      context.resetComposer()

      await chatApi.editMessage(
        conversationId,
        messageId,
        {
          content,
          attachments,
          options: resolveSavedGenerationSettings(
            context.currentConversation,
            context.settingsDraft,
          ),
        },
        createStreamEventHandler(
          context,
          conversationId,
          optimisticAssistantId,
        ),
        generation.controller.signal,
      )

      if (!generation.stopRequested) {
        await context.reconcileConversationState(conversationId)
        await context.loadConversations()
      }
    } catch (error) {
      if (isStoppedGenerationAbort(generation, error)) {
        return
      }

      context.setChatError(
        error instanceof Error ? error.message : context.t('error.updateMessage'),
      )
      const preserveMessages = markAssistantMessageAsFailed(
        optimisticMessages,
        optimisticAssistantId,
        context.t('error.completeReply'),
      )
      context.setMessages((previous) =>
        markAssistantMessageAsFailed(
          previous,
          optimisticAssistantId,
          context.t('error.completeReply'),
        ),
      )
      await context.reconcileConversationState(conversationId, {
        clearErrorOnSuccess: false,
        preserveMessages,
      })
    } finally {
      await settleWorkflowGenerationCleanup(context, generation)
    }
  }
}
