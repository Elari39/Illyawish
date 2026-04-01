import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import type {
  Conversation,
  Message,
  StreamEvent,
} from '../../../types/chat'
import {
  appendToStreamingMessage,
  isSameMessage,
  updateStreamingAssistantMessage,
  upsertMessage,
} from '../utils'
import { readLastEventSeq, writeLastEventSeq } from '../stream-seq-storage'
import type { ActiveGenerationState } from './chat-generation-types'
import { syncGenerationMessageId } from './chat-generation-lifecycle'

interface MessageTarget {
  conversationId: Conversation['id']
  placeholderId: number
  messageId: number | null
}

interface UseChatGenerationStreamStateOptions {
  activeConversationId: Conversation['id'] | null
  activeConversationIdRef: MutableRefObject<Conversation['id'] | null>
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
}

export function useChatGenerationStreamState({
  activeConversationId,
  activeConversationIdRef,
  activeGenerationRef,
  setMessages,
  setChatError,
  t,
}: UseChatGenerationStreamStateOptions) {
  const bufferedDeltaRef = useRef<{
    conversationId: Conversation['id']
    placeholderId: number
    content: string
    reasoningContent: string
  } | null>(null)
  const bufferedDeltaFrameRef = useRef<number | null>(null)

  function buildMessageTarget(
    conversationId: Conversation['id'],
    placeholderId: number,
  ): MessageTarget {
    const activeGeneration = activeGenerationRef.current
    return {
      conversationId,
      placeholderId,
      messageId:
        activeGeneration?.conversationId === conversationId
          ? activeGeneration.messageId
          : null,
    }
  }

  function syncEventSequence(conversationId: Conversation['id'], event: StreamEvent) {
    if (typeof event.seq !== 'number' || event.seq <= 0) {
      return
    }

    writeLastEventSeq(conversationId, event.seq)
  }

  function flushBufferedMessageDelta() {
    const bufferedDelta = bufferedDeltaRef.current
    if (!bufferedDelta) {
      return
    }

    bufferedDeltaRef.current = null
    setMessages((previous) =>
      appendToStreamingMessage(
        previous,
        buildMessageTarget(
          bufferedDelta.conversationId,
          bufferedDelta.placeholderId,
        ),
        {
          content: bufferedDelta.content,
          reasoningContent: bufferedDelta.reasoningContent,
        },
      ),
    )
  }

  function cancelBufferedMessageDeltaFrame() {
    if (bufferedDeltaFrameRef.current != null) {
      window.cancelAnimationFrame(bufferedDeltaFrameRef.current)
      bufferedDeltaFrameRef.current = null
    }
  }

  function flushActiveMessageDelta() {
    cancelBufferedMessageDeltaFrame()
    flushBufferedMessageDelta()
  }

  function scheduleBufferedMessageDeltaFlush() {
    if (bufferedDeltaFrameRef.current != null) {
      return
    }

    bufferedDeltaFrameRef.current = window.requestAnimationFrame(() => {
      bufferedDeltaFrameRef.current = null
      flushBufferedMessageDelta()
    })
  }

  function queueBufferedMessageDelta(
    conversationId: Conversation['id'],
    placeholderId: number,
    delta: {
      content?: string
      reasoningContent?: string
    },
  ) {
    const bufferedDelta = bufferedDeltaRef.current
    if (
      bufferedDelta &&
      bufferedDelta.conversationId === conversationId &&
      bufferedDelta.placeholderId === placeholderId
    ) {
      bufferedDelta.content += delta.content ?? ''
      bufferedDelta.reasoningContent += delta.reasoningContent ?? ''
    } else {
      flushBufferedMessageDelta()
      bufferedDeltaRef.current = {
        conversationId,
        placeholderId,
        content: delta.content ?? '',
        reasoningContent: delta.reasoningContent ?? '',
      }
    }

    scheduleBufferedMessageDeltaFlush()
  }

  function resetExecutionState(conversationId: Conversation['id']) {
    writeLastEventSeq(conversationId, 0)
  }

  function markReasoningStarted(target: MessageTarget, observedAt = Date.now()) {
    setMessages((previous) =>
      updateStreamingAssistantMessage(previous, target, (message) => {
        if (message.localReasoningStartedAt != null) {
          return message
        }

        return {
          ...message,
          localReasoningStartedAt: observedAt,
        }
      }),
    )
  }

  function markReasoningCompleted(
    previous: Message[],
    target: MessageTarget,
    observedAt = Date.now(),
  ) {
    return updateStreamingAssistantMessage(previous, target, (message) => {
      if (
        message.localReasoningStartedAt == null ||
        message.localReasoningCompletedAt != null
      ) {
        return message
      }

      return {
        ...message,
        localReasoningCompletedAt: observedAt,
      }
    })
  }

  useEffect(() => {
    return () => {
      cancelBufferedMessageDeltaFrame()
      bufferedDeltaRef.current = null
    }
  }, [])

  useEffect(() => {
    cancelBufferedMessageDeltaFrame()
    bufferedDeltaRef.current = null
  }, [activeConversationId])

  function handleStreamEventForConversation(
    event: StreamEvent,
    conversationId: Conversation['id'] | null,
    placeholderId: number,
  ) {
    if (!conversationId) {
      return
    }

    const eventMessage = event.message
    syncGenerationMessageId(activeGenerationRef, placeholderId, eventMessage)
    syncEventSequence(conversationId, event)

    if (activeConversationIdRef.current !== conversationId) {
      return
    }

    const target = buildMessageTarget(conversationId, placeholderId)

    if (event.type === 'message_start' && eventMessage) {
      setMessages((previous) => upsertMessage(previous, eventMessage, target))
      return
    }

    if (event.type === 'reasoning_start') {
      markReasoningStarted(target)
      return
    }

    if (
      (event.type === 'delta' || event.type === 'message_delta') &&
      typeof event.content === 'string'
    ) {
      queueBufferedMessageDelta(conversationId, placeholderId, {
        content: event.content,
      })
      return
    }

    if (event.type === 'reasoning_delta' && typeof event.content === 'string') {
      markReasoningStarted(target)
      queueBufferedMessageDelta(conversationId, placeholderId, {
        reasoningContent: event.content,
      })
      return
    }

    if (event.type === 'reasoning_done') {
      flushActiveMessageDelta()
      setMessages((previous) => markReasoningCompleted(previous, target))
      return
    }

    if (event.type === 'done' || event.type === 'cancelled') {
      flushActiveMessageDelta()
      if (
        event.type === 'cancelled' &&
        !activeGenerationRef.current?.stopRequested &&
        !activeGenerationRef.current?.suppressCancelError
      ) {
        setChatError(t('error.generationStopped'))
      }
      setMessages((previous) => {
        const messagesWithTiming = markReasoningCompleted(previous, target)
        if (!eventMessage) {
          return messagesWithTiming
        }

        return upsertMessage(messagesWithTiming, eventMessage, target)
      })
      return
    }

    if (event.type === 'error') {
      flushActiveMessageDelta()
      setChatError(event.error ?? t('error.streamingFailed'))
      setMessages((previous) => {
        const messagesWithTiming = markReasoningCompleted(previous, target)
        const currentMessage =
          messagesWithTiming.find((message) => isSameMessage(message, target)) ?? null
        if (!currentMessage && !eventMessage) {
          return messagesWithTiming
        }

        const nextMessage: Message = {
          ...(currentMessage ?? eventMessage!),
          ...(eventMessage ?? {}),
          content:
            eventMessage?.content ||
            currentMessage?.content ||
            t('error.assistantEndedUnexpectedly'),
          status: 'failed',
        }

        return upsertMessage(messagesWithTiming, nextMessage, target)
      })
    }
  }

  return {
    flushActiveMessageDelta,
    handleStreamEventForConversation,
    readLastEventSeq,
    resetExecutionState,
  }
}
