import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
  appendReasoningToStreamingMessage,
  appendToStreamingMessage,
  isSameMessage,
  upsertMessage,
} from '../utils'
import {
  readExecutionPanelState,
  writeExecutionPanelState,
  type StoredExecutionPanelState,
} from '../execution-panel-storage'
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
  const [executionStateVersion, setExecutionStateVersion] = useState(0)
  const bufferedDeltaRef = useRef<{
    conversationId: Conversation['id']
    placeholderId: number
    content: string
  } | null>(null)
  const bufferedReasoningPriorityDeltaRef = useRef<{
    conversationId: Conversation['id']
    placeholderId: number
    content: string
  } | null>(null)
  const reasoningPriorityTargetRef = useRef<{
    conversationId: Conversation['id']
    placeholderId: number
  } | null>(null)
  const bufferedDeltaFrameRef = useRef<number | null>(null)
  const activeExecutionState = useMemo(
    () => {
      void executionStateVersion
      return activeConversationId
        ? readExecutionPanelState(activeConversationId)
        : {
            events: [],
            pendingConfirmationId: null,
          }
    },
    [activeConversationId, executionStateVersion],
  )
  const executionEvents = activeExecutionState.events
  const pendingConfirmationId = activeExecutionState.pendingConfirmationId

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

  function persistExecutionState(
    conversationId: Conversation['id'],
    nextState: StoredExecutionPanelState,
  ) {
    writeExecutionPanelState(conversationId, nextState)
    if (activeConversationIdRef.current === conversationId) {
      setExecutionStateVersion((previous) => previous + 1)
    }
  }

  function readExecutionStateForConversation(conversationId: Conversation['id']) {
    return readExecutionPanelState(conversationId)
  }

  function appendExecutionEvent(
    conversationId: Conversation['id'],
    event: StreamEvent,
  ) {
    const currentState = readExecutionStateForConversation(conversationId)
    const nextState: StoredExecutionPanelState = {
      events: [...currentState.events, event],
      pendingConfirmationId:
        event.type === 'tool_call_confirmation_required'
          ? (event.confirmationId ?? null)
          : event.type === 'tool_call_completed' || event.type === 'done' || event.type === 'cancelled' || event.type === 'error'
            ? null
            : currentState.pendingConfirmationId,
    }
    persistExecutionState(conversationId, nextState)
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
        bufferedDelta.content,
      ),
    )
  }

  function isReasoningPriorityTarget(
    conversationId: Conversation['id'],
    placeholderId: number,
  ) {
    const target = reasoningPriorityTargetRef.current
    return target?.conversationId === conversationId &&
      target.placeholderId === placeholderId
  }

  function clearReasoningPriorityTarget(
    conversationId: Conversation['id'],
    placeholderId: number,
  ) {
    if (isReasoningPriorityTarget(conversationId, placeholderId)) {
      reasoningPriorityTargetRef.current = null
    }
  }

  function flushBufferedReasoningPriorityDelta() {
    const bufferedDelta = bufferedReasoningPriorityDeltaRef.current
    if (!bufferedDelta) {
      return
    }

    bufferedReasoningPriorityDeltaRef.current = null
    setMessages((previous) =>
      appendToStreamingMessage(
        previous,
        buildMessageTarget(
          bufferedDelta.conversationId,
          bufferedDelta.placeholderId,
        ),
        bufferedDelta.content,
      ),
    )
  }

  function queueBufferedReasoningPriorityDelta(
    conversationId: Conversation['id'],
    placeholderId: number,
    content: string,
  ) {
    const bufferedDelta = bufferedReasoningPriorityDeltaRef.current
    if (
      bufferedDelta &&
      bufferedDelta.conversationId === conversationId &&
      bufferedDelta.placeholderId === placeholderId
    ) {
      bufferedDelta.content += content
      return
    }

    flushBufferedReasoningPriorityDelta()
    bufferedReasoningPriorityDeltaRef.current = {
      conversationId,
      placeholderId,
      content,
    }
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
    flushBufferedReasoningPriorityDelta()
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
    content: string,
  ) {
    const bufferedDelta = bufferedDeltaRef.current
    if (
      bufferedDelta &&
      bufferedDelta.conversationId === conversationId &&
      bufferedDelta.placeholderId === placeholderId
    ) {
      bufferedDelta.content += content
    } else {
      flushBufferedMessageDelta()
      bufferedDeltaRef.current = {
        conversationId,
        placeholderId,
        content,
      }
    }

    scheduleBufferedMessageDeltaFlush()
  }

  function enterReasoningPriorityMode(
    conversationId: Conversation['id'],
    placeholderId: number,
  ) {
    cancelBufferedMessageDeltaFrame()
    flushBufferedMessageDelta()
    reasoningPriorityTargetRef.current = {
      conversationId,
      placeholderId,
    }
  }

  function resetExecutionState(conversationId: Conversation['id']) {
    persistExecutionState(conversationId, {
      events: [],
      pendingConfirmationId: null,
    })
  }

  useEffect(() => {
    return () => {
      cancelBufferedMessageDeltaFrame()
      bufferedDeltaRef.current = null
      bufferedReasoningPriorityDeltaRef.current = null
      reasoningPriorityTargetRef.current = null
    }
  }, [])

  useEffect(() => {
    cancelBufferedMessageDeltaFrame()
    bufferedDeltaRef.current = null
    bufferedReasoningPriorityDeltaRef.current = null
    reasoningPriorityTargetRef.current = null
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

    if (
      event.type === 'run_started' ||
      event.type === 'workflow_step_started' ||
      event.type === 'workflow_step_completed' ||
      event.type === 'retrieval_started' ||
      event.type === 'retrieval_completed' ||
      event.type === 'tool_call_started' ||
      event.type === 'tool_call_confirmation_required' ||
      event.type === 'tool_call_completed' ||
      event.type === 'done' ||
      event.type === 'cancelled' ||
      event.type === 'error'
    ) {
      appendExecutionEvent(conversationId, event)
    }

    if (activeConversationIdRef.current !== conversationId) {
      return
    }

    const target = buildMessageTarget(conversationId, placeholderId)

    if (event.type === 'message_start' && eventMessage) {
      clearReasoningPriorityTarget(conversationId, placeholderId)
      bufferedReasoningPriorityDeltaRef.current = null
      setMessages((previous) =>
        upsertMessage(previous, eventMessage, target),
      )
      return
    }

    if (
      (event.type === 'delta' || event.type === 'message_delta') &&
      typeof event.content === 'string'
    ) {
      if (isReasoningPriorityTarget(conversationId, placeholderId)) {
        queueBufferedReasoningPriorityDelta(
          conversationId,
          placeholderId,
          event.content,
        )
        return
      }
      queueBufferedMessageDelta(conversationId, placeholderId, event.content)
      return
    }

    if (event.type === 'reasoning_start') {
      enterReasoningPriorityMode(conversationId, placeholderId)
      return
    }

    if (event.type === 'reasoning_delta' && typeof event.content === 'string') {
      enterReasoningPriorityMode(conversationId, placeholderId)
      const reasoningContent = event.content
      setMessages((previous) =>
        appendReasoningToStreamingMessage(previous, target, reasoningContent),
      )
      return
    }

    if (event.type === 'reasoning_done') {
      flushBufferedReasoningPriorityDelta()
      clearReasoningPriorityTarget(conversationId, placeholderId)
      return
    }

    if (event.type === 'done' || event.type === 'cancelled') {
      flushActiveMessageDelta()
      clearReasoningPriorityTarget(conversationId, placeholderId)
      if (
        event.type === 'cancelled' &&
        !activeGenerationRef.current?.stopRequested
      ) {
        setChatError(t('error.generationStopped'))
      }
      if (eventMessage) {
        setMessages((previous) =>
          upsertMessage(previous, eventMessage, target),
        )
      }
      return
    }

    if (event.type === 'error') {
      flushActiveMessageDelta()
      clearReasoningPriorityTarget(conversationId, placeholderId)
      setChatError(event.error ?? t('error.streamingFailed'))
      setMessages((previous) => {
        const currentMessage =
          previous.find((message) => isSameMessage(message, target)) ?? null
        if (!currentMessage && !eventMessage) {
          return previous
        }

        const nextMessage: Message = {
          ...(currentMessage ?? eventMessage!),
          ...(eventMessage ?? {}),
          content:
            eventMessage?.content ||
            currentMessage?.content ||
            t('error.assistantEndedUnexpectedly'),
          reasoningContent:
            eventMessage?.reasoningContent ??
            currentMessage?.reasoningContent ??
            '',
          status: 'failed',
        }

        return upsertMessage(previous, nextMessage, target)
      })
    }
  }

  return {
    executionEvents,
    pendingConfirmationId,
    flushActiveMessageDelta,
    handleStreamEventForConversation,
    persistExecutionState,
    resetExecutionState,
  }
}
