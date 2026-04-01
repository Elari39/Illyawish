import { chatApi } from '../../../../lib/api'
import type { Message } from '../../../../types/chat'
import { resolveSavedGenerationSettings } from './helpers'
import { executeAssistantReplayWorkflow, createStreamEventHandler } from './shared'
import type { ChatGenerationWorkflowContext } from './types'

export function createRetryAssistantHandler(
  context: ChatGenerationWorkflowContext,
) {
  return async function handleRetryAssistant(message: Message) {
    if (
      message.role !== 'assistant' ||
      (message.status !== 'failed' && message.status !== 'cancelled') ||
      context.activeGenerationRef.current != null
    ) {
      return
    }

    await executeAssistantReplayWorkflow({
      context,
      message,
      errorKey: 'error.retryReply',
      request: (signal) =>
        chatApi.retryMessage(
          message.conversationId,
          message.id,
          resolveSavedGenerationSettings(
            context.currentConversation,
            context.settingsDraft,
          ),
          createStreamEventHandler(context, message.conversationId, message.id),
          signal,
        ),
    })
  }
}
