import type { Attachment } from '../../../../types/chat'
import { chatApi } from '../../../../lib/api'
import { buildAttachmentPayload } from '../../utils'
import { buildConversationMetadataUpdate } from '../chat-session-helpers'
import {
  buildSubmittedGenerationSettings,
  createOptimisticAssistantMessage,
  createOptimisticUserMessage,
  markAssistantMessageAsFailed,
} from './helpers'
import {
  beginWorkflowGeneration,
  createStreamEventHandler,
  isStoppedGenerationAbort,
  settleWorkflowGenerationCleanup,
} from './shared'
import type {
  ChatGenerationSubmitHandler,
  ChatGenerationWorkflowContext,
  SubmitHandlerOptions,
} from './types'

export function createSendSubmitHandler(context: ChatGenerationWorkflowContext) {
  return async function handleSendSubmit(
    content: string,
    attachments: Attachment[],
  ) {
    context.setChatError(null)
    context.setIsSending(true)

    const optimisticAssistantId = -(Date.now() + 1)
    let conversationId = context.activeConversationId
    let createdConversationId: string | null = null
    let shouldNavigateToConversation = false
    let generation = null
    let optimisticMessages: ReturnType<
      typeof markAssistantMessageAsFailed
    > = []
    const submittedSettings = buildSubmittedGenerationSettings(
      context.settingsDraft,
    )

    try {
      let conversation = context.currentConversation
      let initialStreamSettings = conversation?.settings ?? submittedSettings

      if (!conversationId) {
        const createdConversation = await chatApi.createConversation({
          ...buildConversationMetadataUpdate(
            context.conversationFolderDraft,
            context.conversationTagsDraft,
          ),
          settings: submittedSettings,
          knowledgeSpaceIds: context.knowledgeSpaceIdsDraft,
        })

        conversation = createdConversation
        conversationId = createdConversation.id
        createdConversationId = createdConversation.id
        initialStreamSettings = submittedSettings
        context.activeConversationIdRef.current = conversationId
        context.setPendingConversation(createdConversation)
        context.insertCreatedConversation(createdConversation)
        shouldNavigateToConversation = true
      }

      if (!conversationId) {
        return
      }

      generation = beginWorkflowGeneration(
        context,
        conversationId,
        optimisticAssistantId,
      )

      if (shouldNavigateToConversation) {
        context.navigateToConversation(conversationId)
      }

      const optimisticUserMessage = createOptimisticUserMessage(
        conversationId,
        content,
        attachments,
      )
      const optimisticAssistantMessage = createOptimisticAssistantMessage(
        conversationId,
        optimisticAssistantId,
      )
      optimisticMessages = [
        ...context.messages,
        optimisticUserMessage,
        optimisticAssistantMessage,
      ]

      context.setMessages((previous) => [
        ...previous,
        optimisticUserMessage,
        optimisticAssistantMessage,
      ])
      context.resetComposer()

      await chatApi.streamMessage(
        conversationId,
        {
          content,
          attachments,
          options: initialStreamSettings,
          knowledgeSpaceIds:
            conversation?.knowledgeSpaceIds ?? context.knowledgeSpaceIdsDraft,
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

      const errorMessage =
        error instanceof Error ? error.message : context.t('error.sendMessage')
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

      if (createdConversationId) {
        context.skipNextConversationSyncRef.current = createdConversationId
        await context.cleanupEmptyCreatedConversation(createdConversationId)
      } else if (conversationId) {
        await context.reconcileConversationState(conversationId, {
          clearErrorOnSuccess: false,
          preserveMessages,
        })
      }

      context.setChatError(errorMessage)
    } finally {
      await settleWorkflowGenerationCleanup(context, generation)
    }
  }
}

export function createSubmitHandler({
  context,
  handleEditSubmit,
  handleSendSubmit,
}: SubmitHandlerOptions): ChatGenerationSubmitHandler {
  return async function handleSubmit(event) {
    event.preventDefault()

    if (context.activeGenerationRef.current) {
      return
    }

    try {
      const attachments = await buildAttachmentPayload(
        context.selectedAttachments,
        context.t,
      )
      const content = context.composerValue.trim()

      if (!content && attachments.length === 0) {
        return
      }

      if (context.editingMessageId && context.activeConversationId) {
        await handleEditSubmit(
          context.activeConversationId,
          context.editingMessageId,
          content,
          attachments,
        )
        return
      }

      await handleSendSubmit(content, attachments)
    } catch (error) {
      context.setChatError(
        error instanceof Error ? error.message : context.t('error.prepareMessage'),
      )
    }
  }
}
