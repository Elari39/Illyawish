import {
  type FormEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import { ApiError, isAbortError } from '../../../lib/http'
import { createLocalISOString } from '../../../lib/utils'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  Message,
} from '../../../types/chat'
import {
  buildAttachmentPayload,
} from '../utils'
import type { ComposerAttachment } from '../types'
import { buildConversationMetadataUpdate } from './chat-session-helpers'
import { defaultAgentRunSummary } from '../types'
import {
  beginGeneration,
  finalizeGeneration,
  isIgnorableStopError,
  settleGenerationCleanup,
} from './chat-generation-lifecycle'
import type { ActiveGenerationState } from './chat-generation-types'
import { useChatGenerationStreamState } from './use-chat-generation-stream-state'

interface UseChatGenerationOptions {
  activeConversationId: Conversation['id'] | null
  currentConversation: Conversation | null
  messages: Message[]
  composerValue: string
  selectedAttachments: ComposerAttachment[]
  editingMessageId: number | null
  conversationFolderDraft: string
  conversationTagsDraft: string
  knowledgeSpaceIdsDraft?: number[]
  settingsDraft: ConversationSettings
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
  insertCreatedConversation: (conversation: Conversation) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (conversationId: Conversation['id'], replace?: boolean) => void
  setPendingConversation: (conversation: Conversation | null) => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setIsSending: Dispatch<SetStateAction<boolean>>
  resetComposer: () => void
  activeConversationIdRef: MutableRefObject<Conversation['id'] | null>
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>
  skipNextConversationSyncRef: MutableRefObject<Conversation['id'] | null>
  nextGenerationIdRef: MutableRefObject<number>
  reconcileConversationState: (
    conversationId: Conversation['id'],
    options?: {
      clearErrorOnSuccess?: boolean
      preserveMessages?: Message[]
    },
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
  messages,
  composerValue,
  selectedAttachments,
  editingMessageId,
  conversationFolderDraft,
  conversationTagsDraft,
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
  skipNextConversationSyncRef,
  nextGenerationIdRef,
  reconcileConversationState,
  waitForConversationToSettle,
  cleanupEmptyCreatedConversation,
}: UseChatGenerationOptions) {
  const {
    flushActiveMessageDelta,
    handleStreamEventForConversation,
    readLastEventSeq,
    resetExecutionState,
  } = useChatGenerationStreamState({
    activeConversationId,
    activeConversationIdRef,
    activeGenerationRef,
    setMessages,
    setChatError,
    t,
  })

  async function settleStoppedGeneration(generation: ActiveGenerationState) {
    let clearErrorOnSuccess = true

    flushActiveMessageDelta()

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
      await finalizeGeneration({
        generationId: generation.id,
        activeGenerationRef,
        flushActiveMessageDelta,
        setIsSending,
      })
    }
  }

  function resolveSavedGenerationSettings() {
    return currentConversation?.settings ?? settingsDraft
  }

  function snapshotSubmittedSettings(): ConversationSettings {
    return {
      systemPrompt: settingsDraft.systemPrompt,
      providerPresetId: settingsDraft.providerPresetId ?? null,
      model: settingsDraft.model,
      temperature: settingsDraft.temperature,
      maxTokens: settingsDraft.maxTokens,
      contextWindowTurns: settingsDraft.contextWindowTurns,
    }
  }

  function markAssistantAsFailed(messagesToUpdate: Message[], assistantId: number) {
    return messagesToUpdate.map((message) => {
      if (message.id !== assistantId) {
        return message
      }

      return {
        ...message,
        status: 'failed' as const,
        content: message.content || t('error.completeReply'),
      }
    })
  }

  async function handleSendSubmit(content: string, attachments: Attachment[]) {
    setChatError(null)
    setIsSending(true)

    const optimisticAssistantId = -(Date.now() + 1)
    let conversationId = activeConversationId
    let createdConversationId: Conversation['id'] | null = null
    let shouldNavigateToConversation = false
    let generation: ActiveGenerationState | null = null
    let optimisticMessages: Message[] = []
    const submittedSettings = snapshotSubmittedSettings()

    try {
      let conversation = currentConversation
      let initialStreamSettings =
        conversation?.settings ?? submittedSettings

      if (!conversationId) {
        const createdConversation = await chatApi.createConversation({
          ...buildConversationMetadataUpdate(
            conversationFolderDraft,
            conversationTagsDraft,
          ),
          settings: submittedSettings,
          knowledgeSpaceIds: knowledgeSpaceIdsDraft,
        })
        conversation = createdConversation
        conversationId = createdConversation.id
        createdConversationId = createdConversation.id
        initialStreamSettings = submittedSettings
        activeConversationIdRef.current = conversationId
        setPendingConversation(createdConversation)
        insertCreatedConversation(createdConversation)
        shouldNavigateToConversation = true
      }

      generation = beginGeneration({
        conversationId,
        placeholderId: optimisticAssistantId,
        activeGenerationRef,
        nextGenerationIdRef,
        setIsSending,
        setChatError,
        resetExecutionState,
      })
      if (shouldNavigateToConversation) {
        navigateToConversation(conversationId)
      }
      const optimisticUserMessage: Message = {
        id: -Date.now(),
        conversationId,
        role: 'user',
        content,
        reasoningContent: '',
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
        reasoningContent: '',
        attachments: [],
        status: 'streaming',
        runSummary: defaultAgentRunSummary,
        createdAt: createLocalISOString(),
      }
      optimisticMessages = [
        ...messages,
        optimisticUserMessage,
        optimisticAssistantMessage,
      ]

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
          options: initialStreamSettings,
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

      const errorMessage =
        error instanceof Error ? error.message : t('error.sendMessage')
      const preserveMessages = markAssistantAsFailed(
        optimisticMessages,
        optimisticAssistantId,
      )
      setMessages((previous) =>
        markAssistantAsFailed(previous, optimisticAssistantId),
      )
      if (createdConversationId) {
        skipNextConversationSyncRef.current = createdConversationId
        await cleanupEmptyCreatedConversation(createdConversationId)
      } else if (conversationId) {
        await reconcileConversationState(conversationId, {
          clearErrorOnSuccess: false,
          preserveMessages,
        })
      }
      setChatError(errorMessage)
    } finally {
      await settleGenerationCleanup({
        generation,
        finalizeGeneration: (generationId) => finalizeGeneration({
          generationId,
          activeGenerationRef,
          flushActiveMessageDelta,
          setIsSending,
        }),
        setIsSending,
      })
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
    const optimisticAssistantMessage: Message = {
      id: optimisticAssistantId,
      conversationId,
      role: 'assistant',
      content: '',
      reasoningContent: '',
      attachments: [],
      status: 'streaming',
      runSummary: defaultAgentRunSummary,
      createdAt: createLocalISOString(),
    }
    const generation = beginGeneration({
      conversationId,
      placeholderId: optimisticAssistantId,
      activeGenerationRef,
      nextGenerationIdRef,
      setIsSending,
      setChatError,
      resetExecutionState,
    })
    const optimisticMessages = [
      ...messages
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
        ),
      {
        ...optimisticAssistantMessage,
      },
    ]

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

        updatedMessages.push(optimisticAssistantMessage)

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
      const preserveMessages = markAssistantAsFailed(
        optimisticMessages,
        optimisticAssistantId,
      )
      setMessages((previous) =>
        markAssistantAsFailed(previous, optimisticAssistantId),
      )
      await reconcileConversationState(conversationId, {
        clearErrorOnSuccess: false,
        preserveMessages,
      })
    } finally {
      await settleGenerationCleanup({
        generation,
        finalizeGeneration: (generationId) => finalizeGeneration({
          generationId,
          activeGenerationRef,
          flushActiveMessageDelta,
          setIsSending,
        }),
        setIsSending,
      })
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
    const generation = beginGeneration({
      conversationId: message.conversationId,
      placeholderId: message.id,
      activeGenerationRef,
      nextGenerationIdRef,
      setIsSending,
      setChatError,
      resetExecutionState,
    })
    const optimisticMessages = messages
      .filter((item) => item.id <= message.id)
      .map((item) =>
        item.id === message.id
          ? {
              ...item,
              content: '',
              reasoningContent: '',
              attachments: [],
              status: 'streaming' as const,
              localReasoningStartedAt: undefined,
              localReasoningCompletedAt: undefined,
            }
          : item,
      )

    try {
      setMessages((previous) =>
        previous
          .filter((item) => item.id <= message.id)
          .map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  content: '',
                  reasoningContent: '',
                  attachments: [],
                  status: 'streaming',
                  localReasoningStartedAt: undefined,
                  localReasoningCompletedAt: undefined,
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
      const preserveMessages = markAssistantAsFailed(
        optimisticMessages,
        message.id,
      )
      setMessages((previous) =>
        markAssistantAsFailed(previous, message.id),
      )
      await reconcileConversationState(message.conversationId, {
        clearErrorOnSuccess: false,
        preserveMessages,
      })
    } finally {
      await settleGenerationCleanup({
        generation,
        finalizeGeneration: (generationId) => finalizeGeneration({
          generationId,
          activeGenerationRef,
          flushActiveMessageDelta,
          setIsSending,
        }),
        setIsSending,
      })
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
    const generation = beginGeneration({
      conversationId: message.conversationId,
      placeholderId: message.id,
      activeGenerationRef,
      nextGenerationIdRef,
      setIsSending,
      setChatError,
      resetExecutionState,
    })
    const optimisticMessages = messages
      .filter((item) => item.id <= message.id)
      .map((item) =>
        item.id === message.id
          ? {
              ...item,
              content: '',
              reasoningContent: '',
              attachments: [],
              status: 'streaming' as const,
              localReasoningStartedAt: undefined,
              localReasoningCompletedAt: undefined,
            }
          : item,
      )

    try {
      setMessages((previous) =>
        previous
          .filter((item) => item.id <= message.id)
          .map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  content: '',
                  reasoningContent: '',
                  attachments: [],
                  status: 'streaming',
                  localReasoningStartedAt: undefined,
                  localReasoningCompletedAt: undefined,
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
      const preserveMessages = markAssistantAsFailed(
        optimisticMessages,
        message.id,
      )
      setMessages((previous) =>
        markAssistantAsFailed(previous, message.id),
      )
      await reconcileConversationState(message.conversationId, {
        clearErrorOnSuccess: false,
        preserveMessages,
      })
    } finally {
      await settleGenerationCleanup({
        generation,
        finalizeGeneration: (generationId) => finalizeGeneration({
          generationId,
          activeGenerationRef,
          flushActiveMessageDelta,
          setIsSending,
        }),
        setIsSending,
      })
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

  async function handleResumeConversation(conversationId: Conversation['id']) {
    if (activeGenerationRef.current?.conversationId === conversationId) {
      return
    }

    const generation: ActiveGenerationState = {
      id: nextGenerationIdRef.current + 1,
      conversationId,
      placeholderId: 0,
      messageId: null,
      controller: new AbortController(),
      stopRequested: false,
      suppressCancelError: true,
      stopPromise: null,
    }

    nextGenerationIdRef.current = generation.id
    activeGenerationRef.current = generation
    setIsSending(true)

    try {
      await chatApi.resumeStream(
        conversationId,
        readLastEventSeq(conversationId),
        async (eventData) => {
          handleStreamEventForConversation(
            eventData,
            conversationId,
            0,
          )
        },
        generation.controller.signal,
      )

      await reconcileConversationState(conversationId)
      await loadConversations()
    } catch (error) {
      if (isAbortError(error)) {
        return
      }

      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        await reconcileConversationState(conversationId, {
          clearErrorOnSuccess: false,
        })
        return
      }

      setChatError(
        error instanceof Error ? error.message : t('error.streamingFailed'),
      )
    } finally {
      await finalizeGeneration({
        generationId: generation.id,
        activeGenerationRef,
        flushActiveMessageDelta,
        setIsSending,
      })
    }
  }

  return {
    handleResumeConversation,
    handleRetryAssistant,
    handleRegenerateAssistant,
    handleStopGeneration,
    handleSubmit,
  }
}
