import { isAbortError } from '../../../../lib/http'
import { finalizeGeneration, settleGenerationCleanup, beginGeneration } from '../chat-generation-lifecycle'
import type { ActiveGenerationState } from '../chat-generation-types'
import type { ChatGenerationWorkflowContext } from './types'
import {
  markAssistantMessageAsFailed,
  resetAssistantGenerationMessage,
} from './helpers'
import type { Message } from '../../../../types/chat'

export function beginWorkflowGeneration(
  context: ChatGenerationWorkflowContext,
  conversationId: string,
  placeholderId: number,
) {
  return beginGeneration({
    conversationId,
    placeholderId,
    activeGenerationRef: context.activeGenerationRef,
    nextGenerationIdRef: context.nextGenerationIdRef,
    setIsSending: context.setIsSending,
    setChatError: context.setChatError,
    resetExecutionState: context.resetExecutionState,
  })
}

export function finalizeWorkflowGeneration(
  context: ChatGenerationWorkflowContext,
  generationId: number,
) {
  return finalizeGeneration({
    generationId,
    activeGenerationRef: context.activeGenerationRef,
    flushActiveMessageDelta: context.flushActiveMessageDelta,
    setIsSending: context.setIsSending,
  })
}

export function settleWorkflowGenerationCleanup(
  context: ChatGenerationWorkflowContext,
  generation: ActiveGenerationState | null,
) {
  return settleGenerationCleanup({
    generation,
    finalizeGeneration: (generationId) =>
      finalizeWorkflowGeneration(context, generationId),
    setIsSending: context.setIsSending,
  })
}

export function createStreamEventHandler(
  context: ChatGenerationWorkflowContext,
  conversationId: string,
  placeholderId: number,
) {
  return async (eventData: Parameters<
    ChatGenerationWorkflowContext['handleStreamEventForConversation']
  >[0]) => {
    context.handleStreamEventForConversation(
      eventData,
      conversationId,
      placeholderId,
    )
  }
}

export function isStoppedGenerationAbort(
  generation: ActiveGenerationState | null,
  error: unknown,
) {
  return Boolean(generation?.stopRequested && isAbortError(error))
}

export async function executeAssistantReplayWorkflow({
  context,
  message,
  errorKey,
  request,
}: {
  context: ChatGenerationWorkflowContext
  message: Message
  errorKey: Parameters<ChatGenerationWorkflowContext['t']>[0]
  request: (signal: AbortSignal) => Promise<void>
}) {
  context.setChatError(null)
  context.setIsSending(true)

  const generation = beginWorkflowGeneration(
    context,
    message.conversationId,
    message.id,
  )
  const optimisticMessages = context.messages
    .filter((item) => item.id <= message.id)
    .map((item) =>
      item.id === message.id ? resetAssistantGenerationMessage(item) : item,
    )

  try {
    context.setMessages((previous) =>
      previous
        .filter((item) => item.id <= message.id)
        .map((item) =>
          item.id === message.id
            ? resetAssistantGenerationMessage(item)
            : item,
        ),
    )

    await request(generation.controller.signal)

    if (!generation.stopRequested) {
      await context.reconcileConversationState(message.conversationId)
      await context.loadConversations()
    }
  } catch (error) {
    if (isStoppedGenerationAbort(generation, error)) {
      return
    }

    context.setChatError(
      error instanceof Error ? error.message : context.t(errorKey),
    )
    const preserveMessages = markAssistantMessageAsFailed(
      optimisticMessages,
      message.id,
      context.t('error.completeReply'),
    )
    context.setMessages((previous) =>
      markAssistantMessageAsFailed(
        previous,
        message.id,
        context.t('error.completeReply'),
      ),
    )
    await context.reconcileConversationState(message.conversationId, {
      clearErrorOnSuccess: false,
      preserveMessages,
    })
  } finally {
    await settleWorkflowGenerationCleanup(context, generation)
  }
}
