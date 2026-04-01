import { chatApi } from '../../../../lib/api'
import type { Message } from '../../../../types/chat'
import { resolveSavedGenerationSettings } from './helpers'
import { executeAssistantReplayWorkflow, createStreamEventHandler } from './shared'
import type { ChatGenerationWorkflowContext } from './types'

export function createRegenerateAssistantHandler(
  context: ChatGenerationWorkflowContext,
) {
  return async function handleRegenerateAssistant(message: Message) {
    if (
      message.role !== 'assistant' ||
      message.status !== 'completed' ||
      context.activeGenerationRef.current != null
    ) {
      return
    }

    await executeAssistantReplayWorkflow({
      context,
      message,
      errorKey: 'error.regenerateReply',
      request: (signal) =>
        chatApi.regenerateMessage(
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
