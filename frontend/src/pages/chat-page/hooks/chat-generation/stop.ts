import { chatApi } from '../../../../lib/api'
import { isIgnorableStopError } from '../chat-generation-lifecycle'
import type { ChatGenerationWorkflowContext } from './types'
import { finalizeWorkflowGeneration } from './shared'

async function settleStoppedGeneration(
  context: ChatGenerationWorkflowContext,
  generation: NonNullable<ChatGenerationWorkflowContext['activeGenerationRef']['current']>,
) {
  let clearErrorOnSuccess = true

  context.flushActiveMessageDelta()

  try {
    await chatApi.cancelGeneration(generation.conversationId)
  } catch (error) {
    if (!isIgnorableStopError(error)) {
      clearErrorOnSuccess = false
      context.setChatError(
        error instanceof Error ? error.message : context.t('error.stopGeneration'),
      )
    }
  }

  try {
    await context.waitForConversationToSettle(generation.conversationId, {
      clearErrorOnSuccess,
    })
    await context.loadConversations()
  } catch (error) {
    context.setChatError(
      error instanceof Error ? error.message : context.t('error.stopGeneration'),
    )
  } finally {
    await finalizeWorkflowGeneration(context, generation.id)
  }
}

export function createStopGenerationHandler(
  context: ChatGenerationWorkflowContext,
) {
  return async function handleStopGeneration() {
    const activeGeneration = context.activeGenerationRef.current
    if (!activeGeneration) {
      return
    }

    if (activeGeneration.stopPromise) {
      await activeGeneration.stopPromise
      return
    }

    activeGeneration.stopRequested = true
    activeGeneration.stopPromise = settleStoppedGeneration(
      context,
      activeGeneration,
    )
    await activeGeneration.stopPromise
  }
}
