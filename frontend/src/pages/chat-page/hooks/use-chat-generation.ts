import { useRef, type FormEvent, type MutableRefObject } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
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

export interface ActiveGenerationState {
  id: number
  conversationId: number
  placeholderId: number
  messageId: number | null
  controller: AbortController
  stopRequested: boolean
  stopPromise: Promise<void> | null
}

interface UseChatGenerationOptions {
  activeConversationId: number | null
  currentConversation: Conversation | null
  composerValue: string
  selectedAttachments: ComposerAttachment[]
  editingMessageId: number | null
  conversationFolderDraft: string
  conversationTagsDraft: string
  settingsDraft: ConversationSettings
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
  insertCreatedConversation: (conversation: Conversation) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (conversationId: number, replace?: boolean) => void
  setPendingConversation: (conversation: Conversation | null) => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setIsSending: (value: boolean) => void
  resetComposer: () => void
  activeConversationIdRef: MutableRefObject<number | null>
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>
  nextGenerationIdRef: MutableRefObject<number>
  reconcileConversationState: (
    conversationId: number,
    options?: { clearErrorOnSuccess?: boolean },
  ) => Promise<unknown>
  waitForConversationToSettle: (
    conversationId: number,
    options?: { clearErrorOnSuccess?: boolean },
  ) => Promise<unknown>
  cleanupEmptyCreatedConversation: (conversationId: number) => Promise<void>
}

export function useChatGeneration({
  activeConversationId,
  currentConversation,
  composerValue,
  selectedAttachments,
  editingMessageId,
  conversationFolderDraft,
  conversationTagsDraft,
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

  function beginGeneration(
    conversationId: number,
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
    conversationId: number,
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
    conversationId: number | null,
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

    if ((event.type === 'done' || event.type === 'cancelled') && eventMessage) {
      if (
        event.type === 'cancelled' &&
        !activeGenerationRef.current?.stopRequested
      ) {
        setChatError(t('error.generationStopped'))
      }
      setMessages((previous) =>
        previous.map((message) =>
          isSameMessage(message, target)
            ? eventMessage
            : message,
        ),
      )
      return
    }

    if (event.type === 'error') {
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
    let createdConversationId: number | null = null
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
            model: '',
            temperature: null,
            maxTokens: null,
            contextWindowTurns: null,
          },
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
        createdAt: createLocalISOString(),
      }
      const optimisticAssistantMessage: Message = {
        id: optimisticAssistantId,
        conversationId,
        role: 'assistant',
        content: '',
        attachments: [],
        status: 'streaming',
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
    conversationId: number,
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
  }
}
