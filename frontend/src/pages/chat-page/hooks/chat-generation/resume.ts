import { chatApi } from '../../../../lib/api'
import { ApiError, isAbortError } from '../../../../lib/http'
import type { ChatGenerationWorkflowContext } from './types'
import {
  createStreamEventHandler,
  finalizeWorkflowGeneration,
} from './shared'

export function createResumeConversationHandler(
  context: ChatGenerationWorkflowContext,
) {
  return async function handleResumeConversation(conversationId: string) {
    if (context.activeGenerationRef.current?.conversationId === conversationId) {
      return
    }

    const generation = {
      id: context.nextGenerationIdRef.current + 1,
      conversationId,
      placeholderId: 0,
      messageId: null,
      controller: new AbortController(),
      stopRequested: false,
      suppressCancelError: true,
      stopPromise: null,
    }

    context.nextGenerationIdRef.current = generation.id
    context.activeGenerationRef.current = generation
    context.setIsSending(true)

    try {
      await chatApi.resumeStream(
        conversationId,
        context.readLastEventSeq(conversationId),
        createStreamEventHandler(context, conversationId, 0),
        generation.controller.signal,
      )

      await context.reconcileConversationState(conversationId)
      await context.loadConversations()
    } catch (error) {
      if (isAbortError(error)) {
        return
      }

      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 409)
      ) {
        await context.reconcileConversationState(conversationId, {
          clearErrorOnSuccess: false,
        })
        return
      }

      context.setChatError(
        error instanceof Error ? error.message : context.t('error.streamingFailed'),
      )
    } finally {
      await finalizeWorkflowGeneration(context, generation.id)
    }
  }
}
