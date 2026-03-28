import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
} from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { agentApi, chatApi } from '../../../lib/api'
import { ApiError, isAbortError } from '../../../lib/http'
import { createLocalISOString } from '../../../lib/utils'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  Message,
  StreamEvent,
} from '../../../types/chat'
import {
  appendToStreamingMessage,
  buildAttachmentPayload,
  isSameMessage,
  upsertMessage,
} from '../utils'
import type { ComposerAttachment } from '../types'
import { buildConversationMetadataUpdate } from './chat-session-helpers'
import { defaultAgentRunSummary } from '../types'
import {
  clearExecutionPanelState,
  readExecutionPanelState,
  writeExecutionPanelState,
  type StoredExecutionPanelState,
} from '../execution-panel-storage'

export interface ActiveGenerationState {
  id: number
  conversationId: Conversation['id']
  placeholderId: number
  messageId: number | null
  controller: AbortController
  stopRequested: boolean
  stopPromise: Promise<void> | null
}

interface UseChatGenerationOptions {
  activeConversationId: Conversation['id'] | null
  currentConversation: Conversation | null
  composerValue: string
  selectedAttachments: ComposerAttachment[]
  editingMessageId: number | null
  conversationFolderDraft: string
  conversationTagsDraft: string
  workflowPresetIdDraft?: number | null
  knowledgeSpaceIdsDraft?: number[]
  settingsDraft: ConversationSettings
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
  insertCreatedConversation: (conversation: Conversation) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (conversationId: Conversation['id'], replace?: boolean) => void
  setPendingConversation: (conversation: Conversation | null) => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setIsSending: (value: boolean) => void
  resetComposer: () => void
  activeConversationIdRef: MutableRefObject<Conversation['id'] | null>
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>
  nextGenerationIdRef: MutableRefObject<number>
  reconcileConversationState: (
    conversationId: Conversation['id'],
    options?: { clearErrorOnSuccess?: boolean },
  ) => Promise<unknown>
  waitForConversationToSettle: (
    conversationId: Conversation['id'],
    options?: { clearErrorOnSuccess?: boolean },
  ) => Promise<unknown>
  cleanupEmptyCreatedConversation: (conversationId: Conversation['id']) => Promise<void>
}

export function useChatGeneration({
  activeConversationId,
  currentConversation,
  composerValue,
  selectedAttachments,
  editingMessageId,
  conversationFolderDraft,
  conversationTagsDraft,
  workflowPresetIdDraft = null,
  knowledgeSpaceIdsDraft = [],
  settingsDraft,
  setChatError,
  t,
  insertCreatedConversation,
  loadConversations,
  navigateToConversation,
  setPendingConversation,
  setMessages,
  setIsSending,
  resetComposer,
  activeConversationIdRef,
  activeGenerationRef,
  nextGenerationIdRef,
  reconcileConversationState,
  waitForConversationToSettle,
  cleanupEmptyCreatedConversation,
}: UseChatGenerationOptions) {
  const tRef = useRef(t)
  tRef.current = t
  const [executionEvents, setExecutionEvents] = useState<StreamEvent[]>([])
  const [pendingConfirmationId, setPendingConfirmationId] = useState<string | null>(null)
  const executionEventsRef = useRef<StreamEvent[]>([])
  const pendingConfirmationIdRef = useRef<string | null>(null)

  function applyExecutionState(nextState: StoredExecutionPanelState) {
    executionEventsRef.current = nextState.events
    pendingConfirmationIdRef.current = nextState.pendingConfirmationId
    setExecutionEvents(nextState.events)
    setPendingConfirmationId(nextState.pendingConfirmationId)
  }

  function persistExecutionState(
    conversationId: Conversation['id'],
    nextState: StoredExecutionPanelState,
  ) {
    applyExecutionState(nextState)
    writeExecutionPanelState(conversationId, nextState)
  }

  useEffect(() => {
    if (!activeConversationId) {
      executionEventsRef.current = []
      pendingConfirmationIdRef.current = null
      setExecutionEvents([])
      setPendingConfirmationId(null)
      return
    }

    const restoredState = readExecutionPanelState(activeConversationId)
    executionEventsRef.current = restoredState.events
    pendingConfirmationIdRef.current = restoredState.pendingConfirmationId
    setExecutionEvents(restoredState.events)
    setPendingConfirmationId(restoredState.pendingConfirmationId)
  }, [activeConversationId])

  function beginGeneration(
    conversationId: Conversation['id'],
    placeholderId: number,
  ) {
    const generation: ActiveGenerationState = {
      id: nextGenerationIdRef.current + 1,
      conversationId,
      placeholderId,
      messageId: null,
      controller: new AbortController(),
      stopRequested: false,
      stopPromise: null,
    }

    nextGenerationIdRef.current = generation.id
    activeGenerationRef.current = generation
    setIsSending(true)
    setChatError(null)
    clearExecutionPanelState(conversationId)
    persistExecutionState(conversationId, {
      events: [],
      pendingConfirmationId: null,
    })
    return generation
  }

  function syncGenerationMessageId(
    placeholderId: number,
    message: Message | undefined,
  ) {
    const activeGeneration = activeGenerationRef.current
    if (
      !activeGeneration ||
      !message ||
      activeGeneration.conversationId !== message.conversationId
    ) {
      return
    }

    if (
      activeGeneration.placeholderId === placeholderId ||
      activeGeneration.messageId === placeholderId ||
      activeGeneration.messageId === message.id
    ) {
      activeGeneration.messageId = message.id
    }
  }

  async function finalizeGeneration(generationId: number) {
    if (activeGenerationRef.current?.id !== generationId) {
      return
    }

    activeGenerationRef.current = null
    setIsSending(false)
  }

  async function settleGenerationCleanup(
    generation: ActiveGenerationState | null,
  ) {
    if (!generation) {
      setIsSending(false)
      return
    }

    if (generation.stopRequested && generation.stopPromise) {
      await generation.stopPromise
      return
    }

    await finalizeGeneration(generation.id)
  }

  function isIgnorableStopError(error: unknown) {
    return (
      isAbortError(error) ||
      (error instanceof ApiError &&
        error.status === 409 &&
        error.message === 'no active generation for this conversation')
    )
  }

  async function settleStoppedGeneration(generation: ActiveGenerationState) {
    let clearErrorOnSuccess = true

    try {
      await chatApi.cancelGeneration(generation.conversationId)
    } catch (error) {
      if (!isIgnorableStopError(error)) {
        clearErrorOnSuccess = false
        setChatError(
          error instanceof Error ? error.message : t('error.stopGeneration'),
        )
      }
    }

    try {
      await waitForConversationToSettle(generation.conversationId, {
        clearErrorOnSuccess,
      })
      await loadConversations()
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.stopGeneration'),
      )
    } finally {
      await finalizeGeneration(generation.id)
    }
  }

  function buildMessageTarget(
    conversationId: Conversation['id'],
    placeholderId: number,
  ) {
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

  function handleStreamEventForConversation(
    event: StreamEvent,
    conversationId: Conversation['id'] | null,
    placeholderId: number,
  ) {
    if (!conversationId) {
      return
    }

    const eventMessage = event.message
    syncGenerationMessageId(placeholderId, eventMessage)
    if (activeConversationIdRef.current !== conversationId) {
      return
    }

    const target = buildMessageTarget(conversationId, placeholderId)

    if (event.type === 'message_start' && eventMessage) {
      setMessages((previous) =>
        upsertMessage(previous, eventMessage, target),
      )
      return
    }

    if (event.type === 'delta' && typeof event.content === 'string') {
      const deltaContent = event.content
      setMessages((previous) =>
        appendToStreamingMessage(previous, target, deltaContent),
      )
      return
    }

    if (event.type === 'message_delta' && typeof event.content === 'string') {
      const deltaContent = event.content
      setMessages((previous) =>
        appendToStreamingMessage(previous, target, deltaContent),
      )
      return
    }

    if (
      event.type === 'run_started' ||
      event.type === 'workflow_step_started' ||
      event.type === 'workflow_step_completed' ||
      event.type === 'retrieval_started' ||
      event.type === 'retrieval_completed' ||
      event.type === 'tool_call_started' ||
      event.type === 'tool_call_confirmation_required' ||
      event.type === 'tool_call_completed'
    ) {
      const nextState: StoredExecutionPanelState = {
        events: [...executionEventsRef.current, event],
        pendingConfirmationId:
          event.type === 'tool_call_confirmation_required'
            ? (event.confirmationId ?? null)
            : event.type === 'tool_call_completed'
              ? null
              : pendingConfirmationIdRef.current,
      }
      persistExecutionState(conversationId, nextState)
      return
    }

    if (event.type === 'done' || event.type === 'cancelled') {
      persistExecutionState(conversationId, {
        events: [...executionEventsRef.current, event],
        pendingConfirmationId: null,
      })
      if (
        event.type === 'cancelled' &&
        !activeGenerationRef.current?.stopRequested
      ) {
        setChatError(t('error.generationStopped'))
      }
      if (eventMessage) {
        setMessages((previous) =>
          previous.map((message) =>
            isSameMessage(message, target)
              ? eventMessage
              : message,
          ),
        )
      }
      return
    }

    if (event.type === 'error') {
      persistExecutionState(conversationId, {
        events: [...executionEventsRef.current, event],
        pendingConfirmationId: null,
      })
      setChatError(event.error ?? t('error.streamingFailed'))
      setMessages((previous) =>
        previous.map((message) => {
          if (isSameMessage(message, target)) {
            return {
              ...(eventMessage ?? message),
              content:
                eventMessage?.content ||
                message.content ||
                t('error.assistantEndedUnexpectedly'),
              status: 'failed',
            }
          }

          return message
        }),
      )
    }
  }

  function resolveSavedGenerationSettings() {
    return currentConversation?.settings ?? settingsDraft
  }

  async function handleSendSubmit(content: string, attachments: Attachment[]) {
    setChatError(null)
    setIsSending(true)

    const optimisticAssistantId = -(Date.now() + 1)
    let conversationId = activeConversationId
    let createdConversationId: Conversation['id'] | null = null
    let generation: ActiveGenerationState | null = null

    try {
      let conversation = currentConversation

      if (!conversationId) {
        const createdConversation = await chatApi.createConversation({
          ...buildConversationMetadataUpdate(
            conversationFolderDraft,
            conversationTagsDraft,
          ),
          settings: {
            ...settingsDraft,
            providerPresetId: settingsDraft.providerPresetId ?? null,
            model: settingsDraft.model,
            temperature: null,
            maxTokens: null,
            contextWindowTurns: null,
          },
          workflowPresetId: workflowPresetIdDraft,
          knowledgeSpaceIds: knowledgeSpaceIdsDraft,
        })
        conversation = createdConversation
        conversationId = createdConversation.id
        createdConversationId = createdConversation.id
        activeConversationIdRef.current = conversationId
        setPendingConversation(createdConversation)
        insertCreatedConversation(createdConversation)
        navigateToConversation(conversationId)
      }

      const conversationSettings =
        conversation?.settings ?? resolveSavedGenerationSettings()
      generation = beginGeneration(conversationId, optimisticAssistantId)
      const optimisticUserMessage: Message = {
        id: -Date.now(),
        conversationId,
        role: 'user',
        content,
        attachments,
        status: 'completed',
        runSummary: defaultAgentRunSummary,
        createdAt: createLocalISOString(),
      }
      const optimisticAssistantMessage: Message = {
        id: optimisticAssistantId,
        conversationId,
        role: 'assistant',
        content: '',
        attachments: [],
        status: 'streaming',
        runSummary: defaultAgentRunSummary,
        createdAt: createLocalISOString(),
      }

      setMessages((previous) => [
        ...previous,
        optimisticUserMessage,
        optimisticAssistantMessage,
      ])
      resetComposer()

      await chatApi.streamMessage(
        conversationId,
        {
          content,
          attachments,
          options: conversationSettings,
          workflowPresetId:
            conversation?.workflowPresetId ?? workflowPresetIdDraft,
          knowledgeSpaceIds:
            conversation?.knowledgeSpaceIds ?? knowledgeSpaceIdsDraft,
        },
        async (eventData) => {
          handleStreamEventForConversation(
            eventData,
            conversationId,
            optimisticAssistantId,
          )
        },
        generation.controller.signal,
      )

      if (!generation.stopRequested) {
        await reconcileConversationState(conversationId)
        await loadConversations()
      }
    } catch (error) {
      if (generation?.stopRequested && isAbortError(error)) {
        return
      }

      setChatError(
        error instanceof Error ? error.message : t('error.sendMessage'),
      )
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== optimisticAssistantId) {
            return message
          }
          return {
            ...message,
            status: 'failed',
            content: message.content || t('error.completeReply'),
          }
        }),
      )
      if (createdConversationId) {
        await cleanupEmptyCreatedConversation(createdConversationId)
      } else if (conversationId) {
        await reconcileConversationState(conversationId, {
          clearErrorOnSuccess: false,
        })
      }
    } finally {
      await settleGenerationCleanup(generation)
    }
  }

  async function handleEditSubmit(
    conversationId: Conversation['id'],
    messageId: number,
    content: string,
    attachments: Attachment[],
  ) {
    setChatError(null)
    setIsSending(true)
    const optimisticAssistantId = -(Date.now() + 1)
    const generation = beginGeneration(conversationId, optimisticAssistantId)

    try {
      setMessages((previous) => {
        const updatedMessages = previous
          .filter((message) => message.id <= messageId)
          .map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content,
                  attachments,
                  status: 'completed' as const,
                  runSummary: defaultAgentRunSummary,
                }
              : message,
          )

        updatedMessages.push({
          id: optimisticAssistantId,
          conversationId,
          role: 'assistant',
          content: '',
          attachments: [],
          status: 'streaming',
          runSummary: defaultAgentRunSummary,
          createdAt: createLocalISOString(),
        })

        return updatedMessages
      })

      resetComposer()

      await chatApi.editMessage(
        conversationId,
        messageId,
        {
          content,
          attachments,
          options: resolveSavedGenerationSettings(),
        },
        async (eventData) => {
          handleStreamEventForConversation(
            eventData,
            conversationId,
            optimisticAssistantId,
          )
        },
        generation.controller.signal,
      )

      if (!generation.stopRequested) {
        await reconcileConversationState(conversationId)
        await loadConversations()
      }
    } catch (error) {
      if (generation.stopRequested && isAbortError(error)) {
        return
      }

      setChatError(
        error instanceof Error ? error.message : t('error.updateMessage'),
      )
      setMessages((previous) =>
        previous.map((message) =>
          message.id === optimisticAssistantId
            ? {
                ...message,
                status: 'failed',
                content: message.content || t('error.completeReply'),
              }
            : message,
        ),
      )
      await reconcileConversationState(conversationId, {
        clearErrorOnSuccess: false,
      })
    } finally {
      await settleGenerationCleanup(generation)
    }
  }

  async function handleRetryAssistant(message: Message) {
    if (
      message.role !== 'assistant' ||
      (message.status !== 'failed' && message.status !== 'cancelled') ||
      activeGenerationRef.current != null
    ) {
      return
    }

    setChatError(null)
    setIsSending(true)
    const generation = beginGeneration(message.conversationId, message.id)

    try {
      setMessages((previous) =>
        previous
          .filter((item) => item.id <= message.id)
          .map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  content: '',
                  attachments: [],
                  status: 'streaming',
                }
              : item,
          ),
      )

      await chatApi.retryMessage(
        message.conversationId,
        message.id,
        resolveSavedGenerationSettings(),
        async (eventData) => {
          handleStreamEventForConversation(
            eventData,
            message.conversationId,
            message.id,
          )
        },
        generation.controller.signal,
      )

      if (!generation.stopRequested) {
        await reconcileConversationState(message.conversationId)
        await loadConversations()
      }
    } catch (error) {
      if (generation.stopRequested && isAbortError(error)) {
        return
      }

      setChatError(
        error instanceof Error ? error.message : t('error.retryReply'),
      )
      setMessages((previous) =>
        previous.map((item) =>
          item.id === message.id
            ? {
                ...item,
                status: 'failed',
                content: item.content || t('error.completeReply'),
              }
            : item,
        ),
      )
      await reconcileConversationState(message.conversationId, {
        clearErrorOnSuccess: false,
      })
    } finally {
      await settleGenerationCleanup(generation)
    }
  }

  async function handleRegenerateAssistant(message: Message) {
    if (
      message.role !== 'assistant' ||
      message.status !== 'completed' ||
      activeGenerationRef.current != null
    ) {
      return
    }

    setChatError(null)
    setIsSending(true)
    const generation = beginGeneration(message.conversationId, message.id)

    try {
      setMessages((previous) =>
        previous
          .filter((item) => item.id <= message.id)
          .map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  content: '',
                  attachments: [],
                  status: 'streaming',
                }
              : item,
          ),
      )

      await chatApi.regenerateMessage(
        message.conversationId,
        message.id,
        resolveSavedGenerationSettings(),
        async (eventData) => {
          handleStreamEventForConversation(
            eventData,
            message.conversationId,
            message.id,
          )
        },
        generation.controller.signal,
      )

      if (!generation.stopRequested) {
        await reconcileConversationState(message.conversationId)
        await loadConversations()
      }
    } catch (error) {
      if (generation.stopRequested && isAbortError(error)) {
        return
      }

      setChatError(
        error instanceof Error ? error.message : t('error.regenerateReply'),
      )
      setMessages((previous) =>
        previous.map((item) =>
          item.id === message.id
            ? {
                ...item,
                status: 'failed',
                content: item.content || t('error.completeReply'),
              }
            : item,
        ),
      )
      await reconcileConversationState(message.conversationId, {
        clearErrorOnSuccess: false,
      })
    } finally {
      await settleGenerationCleanup(generation)
    }
  }

  async function handleStopGeneration() {
    const activeGeneration = activeGenerationRef.current
    if (!activeGeneration) {
      return
    }

    if (activeGeneration.stopPromise) {
      await activeGeneration.stopPromise
      return
    }

    activeGeneration.stopRequested = true
    activeGeneration.stopPromise = settleStoppedGeneration(activeGeneration)
    await activeGeneration.stopPromise
  }

  async function handleConfirmToolCall(approved: boolean) {
    if (!pendingConfirmationId) {
      return
    }

    try {
      await agentApi.confirmToolCall(pendingConfirmationId, approved)
      setPendingConfirmationId(null)
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.streamingFailed'),
      )
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (activeGenerationRef.current) {
      return
    }

    try {
      const attachments = await buildAttachmentPayload(selectedAttachments, t)
      const content = composerValue.trim()

      if (!content && attachments.length === 0) {
        return
      }

      if (editingMessageId && activeConversationId) {
        await handleEditSubmit(
          activeConversationId,
          editingMessageId,
          content,
          attachments,
        )
        return
      }

      await handleSendSubmit(content, attachments)
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.prepareMessage'),
      )
    }
  }

  return {
    handleRetryAssistant,
    handleRegenerateAssistant,
    handleStopGeneration,
    handleSubmit,
    executionEvents,
    pendingConfirmationId,
    handleConfirmToolCall,
  }
}
