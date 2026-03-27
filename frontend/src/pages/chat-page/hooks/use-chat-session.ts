import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import { ApiError, isAbortError } from '../../../lib/http'
import { createLocalISOString } from '../../../lib/utils'
import type {
  Attachment,
  Conversation,
  ConversationMessagesResponse,
  Message,
  StreamEvent,
} from '../../../types/chat'
import type { ToastVariant } from '../types'
import {
  appendToStreamingMessage,
  buildAttachmentPayload,
  buildConversationMarkdown,
  buildConversationExportFilename,
  clearLastConversationId,
  dedupeMessages,
  downloadTextFile,
  isConversationNotFoundError,
  isSameMessage,
  parseConversationMarkdownImport,
  upsertMessage,
  writeLastConversationId,
} from '../utils'
import {
  buildConversationMetadataUpdate,
  resolveConversationForList,
  wait,
} from './chat-session-helpers'
import { useChatComposerState } from './use-chat-composer-state'
import { useChatMessagesState } from './use-chat-messages-state'
import { useChatSettingsState } from './use-chat-settings-state'

interface UseChatSessionOptions {
  activeConversationId: number | null
  currentConversation: Conversation | null
  search: string
  showArchived: boolean
  setChatError: (value: string | null) => void
  showToast: (message: string, variant?: ToastVariant) => void
  insertCreatedConversation: (conversation: Conversation) => void
  removeConversationFromList: (conversationId: number) => void
  syncConversationIntoList: (conversation: Conversation) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (conversationId: number, replace?: boolean) => void
  navigateHome: (replace?: boolean) => void
  setSkipAutoResume: (value: boolean) => void
  t: I18nContextValue['t']
  locale: string
}

interface ActiveGenerationState {
  id: number
  conversationId: number
  placeholderId: number
  messageId: number | null
  controller: AbortController
  stopRequested: boolean
  stopPromise: Promise<void> | null
}

const STOP_RECONCILE_ATTEMPTS = 12
const STOP_RECONCILE_DELAY_MS = 150
const MESSAGE_PAGE_SIZE = 50

export function useChatSession({
  activeConversationId,
  currentConversation,
  search,
  showArchived,
  setChatError,
  showToast,
  insertCreatedConversation,
  removeConversationFromList,
  syncConversationIntoList,
  loadConversations,
  navigateToConversation,
  navigateHome,
  setSkipAutoResume,
  t,
  locale,
}: UseChatSessionOptions) {
  const {
    composerFormRef,
    fileInputRef,
    composerIsComposingRef,
    composerValue,
    selectedAttachments,
    editingMessageId,
    hasPendingUploads,
    setComposerValue,
    clearEditingMessage,
    cancelEditingMessage,
    handleFilesSelected,
    removeSelectedAttachment,
    resetComposer,
    startEditingMessage,
  } = useChatComposerState({
    setChatError,
    showToast,
    t,
  })
  const {
    messageViewportRef,
    messages,
    isLoadingMessages,
    isSending,
    latestUserMessage,
    latestAssistantMessage,
    skipNextMessageAutoScroll,
    setMessages,
    setIsLoadingMessages,
    setIsSending,
  } = useChatMessagesState()
  const {
    chatSettingsDraft,
    conversationFolderDraft,
    conversationTagsDraft,
    pendingConversation,
    settingsDraft,
    setChatSettingsDraft,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setPendingConversation,
    setSettingsDraft,
    handleSaveSettings,
    resetForNewChatSettings,
    resetSettingsDraft,
    syncSettingsDraft,
  } = useChatSettingsState({
    activeConversationId,
    currentConversation,
    setChatError,
    syncConversationIntoList,
    t,
  })
  const [isImporting, setIsImporting] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [nextBeforeMessageId, setNextBeforeMessageId] = useState<number | null>(
    null,
  )
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)

  const activeGenerationRef = useRef<ActiveGenerationState | null>(null)
  const nextGenerationIdRef = useRef(0)
  const activeConversationIdRef = useRef<number | null>(null)
  const conversationSearchRef = useRef(search)
  const showArchivedRef = useRef(showArchived)
  const syncConversationIntoListRef = useRef(syncConversationIntoList)
  const navigateHomeRef = useRef(navigateHome)
  const setSkipAutoResumeRef = useRef(setSkipAutoResume)
  const tRef = useRef(t)

  conversationSearchRef.current = search
  showArchivedRef.current = showArchived
  syncConversationIntoListRef.current = syncConversationIntoList
  navigateHomeRef.current = navigateHome
  setSkipAutoResumeRef.current = setSkipAutoResume
  tRef.current = t

  async function cleanupEmptyCreatedConversation(conversationId: number) {
    const reconciled = await reconcileConversationState(conversationId, {
      clearErrorOnSuccess: false,
    })
    if (!reconciled || reconciled.messages.length > 0) {
      return
    }

    try {
      await chatApi.deleteConversation(conversationId)
    } catch {
      return
    }

    removeConversationFromList(conversationId)
    clearLastConversationId(conversationId)
    setSkipAutoResumeRef.current(true)
    activeConversationIdRef.current = null
    setPendingConversation(null)
    setMessages([])
    navigateHomeRef.current(true)
  }

  const canSubmitComposer =
    !isSending &&
    !hasPendingUploads &&
    (composerValue.trim().length > 0 || selectedAttachments.length > 0)

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    if (activeConversationId) {
      return
    }

    setMessages([])
    setHasMoreMessages(false)
    setNextBeforeMessageId(null)
    setIsLoadingOlderMessages(false)
    resetForNewChatSettings()
    clearEditingMessage()
    setChatError(null)
  }, [activeConversationId, clearEditingMessage, resetForNewChatSettings, setChatError, setMessages])

  const applyConversationSnapshot = useCallback((
    response: ConversationMessagesResponse,
    replaceMessages: boolean,
  ) => {
    syncConversationIntoListRef.current(
      resolveConversationForList(
        response.conversation,
        showArchivedRef.current,
        conversationSearchRef.current,
      ),
    )
    setPendingConversation(response.conversation)
    if (replaceMessages) {
      setMessages(response.messages)
      setSettingsDraft(response.conversation.settings)
    }
    setHasMoreMessages(response.pagination?.hasMore ?? false)
    setNextBeforeMessageId(response.pagination?.nextBeforeId ?? null)
    writeLastConversationId(response.conversation.id)
  }, [setMessages, setPendingConversation, setSettingsDraft])

  useEffect(() => {
    if (
      !activeConversationId ||
      activeGenerationRef.current?.conversationId === activeConversationId
    ) {
      return
    }

    const targetConversationId = activeConversationId
    let cancelled = false

    async function syncMessages() {
      try {
        setIsLoadingMessages(true)
        setChatError(null)

        const response =
          await chatApi.getConversationMessages(targetConversationId)
        if (cancelled) {
          return
        }

        applyConversationSnapshot(response, true)
        setConversationFolderDraft(response.conversation.folder)
        setConversationTagsDraft(response.conversation.tags.join(', '))
      } catch (error) {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error
            ? error.message
            : tRef.current('error.loadMessages')
        setChatError(message)
        setMessages([])

        if (isConversationNotFoundError(error)) {
          clearLastConversationId(targetConversationId)
          setSkipAutoResumeRef.current(true)
          activeConversationIdRef.current = null
          navigateHomeRef.current(true)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMessages(false)
        }
      }
    }

    void syncMessages()

    return () => {
      cancelled = true
    }
  }, [
    activeConversationId,
    applyConversationSnapshot,
    setChatError,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setIsLoadingMessages,
    setMessages,
  ])

  async function reconcileConversationState(
    conversationId: number,
    { clearErrorOnSuccess = true }: { clearErrorOnSuccess?: boolean } = {},
  ) {
    try {
      const response = await chatApi.getConversationMessages(conversationId)
      applyConversationSnapshot(
        response,
        activeConversationIdRef.current === conversationId,
      )
      if (clearErrorOnSuccess) {
        setChatError(null)
      }
      return response
    } catch (error) {
      if (isConversationNotFoundError(error)) {
        clearLastConversationId(conversationId)
        if (activeConversationIdRef.current === conversationId) {
          setSkipAutoResumeRef.current(true)
          activeConversationIdRef.current = null
          setMessages([])
          navigateHomeRef.current(true)
        }
      }
      return null
    }
  }

  async function loadOlderMessages() {
    if (
      !activeConversationId ||
      !hasMoreMessages ||
      !nextBeforeMessageId ||
      isLoadingOlderMessages
    ) {
      return
    }

    const viewport = messageViewportRef.current
    const previousScrollHeight = viewport?.scrollHeight ?? 0

    setIsLoadingOlderMessages(true)
    setChatError(null)

    try {
      const response = await chatApi.getConversationMessages(activeConversationId, {
        beforeId: nextBeforeMessageId,
        limit: MESSAGE_PAGE_SIZE,
      })

      skipNextMessageAutoScroll()
      setMessages((previous) => dedupeMessages([
        ...response.messages,
        ...previous,
      ]))
      setPendingConversation(response.conversation)
      syncConversationIntoListRef.current(
        resolveConversationForList(
          response.conversation,
          showArchivedRef.current,
          conversationSearchRef.current,
        ),
      )
      setHasMoreMessages(response.pagination?.hasMore ?? false)
      setNextBeforeMessageId(response.pagination?.nextBeforeId ?? null)

      window.requestAnimationFrame(() => {
        const nextViewport = messageViewportRef.current
        if (!nextViewport) {
          return
        }

        const heightDelta = nextViewport.scrollHeight - previousScrollHeight
        nextViewport.scrollTop += heightDelta
      })
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.loadMessages'),
      )
    } finally {
      setIsLoadingOlderMessages(false)
    }
  }

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

  async function waitForConversationToSettle(
    conversationId: number,
    { clearErrorOnSuccess = true }: { clearErrorOnSuccess?: boolean } = {},
  ) {
    let latestResponse: Awaited<ReturnType<typeof reconcileConversationState>> = null

    for (let attempt = 0; attempt < STOP_RECONCILE_ATTEMPTS; attempt += 1) {
      const response = await reconcileConversationState(conversationId, {
        clearErrorOnSuccess,
      })
      if (!response) {
        return latestResponse
      }

      latestResponse = response
      const hasStreamingAssistant = response.messages.some(
        (message) =>
          message.role === 'assistant' && message.status === 'streaming',
      )
      if (!hasStreamingAssistant) {
        return response
      }

      await wait(STOP_RECONCILE_DELAY_MS)
    }

    return latestResponse
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

  function handleStreamEvent(event: StreamEvent, placeholderId: number) {
    const eventMessage = event.message
    syncGenerationMessageId(placeholderId, eventMessage)

    if (event.type === 'message_start' && eventMessage) {
      setMessages((previous) =>
        upsertMessage(previous, eventMessage, placeholderId),
      )
      return
    }

    if (event.type === 'delta' && typeof event.content === 'string') {
      setMessages((previous) =>
        appendToStreamingMessage(previous, event.content!),
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
          isSameMessage(message, eventMessage, placeholderId)
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
          if (isSameMessage(message, eventMessage, placeholderId)) {
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
        conversation?.settings ?? settingsDraft
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
          handleStreamEvent(eventData, optimisticAssistantId)
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
          options: settingsDraft,
        },
        async (eventData) => {
          handleStreamEvent(eventData, optimisticAssistantId)
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
      isSending
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
        settingsDraft,
        async (eventData) => {
          handleStreamEvent(eventData, message.id)
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
      isSending
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
        settingsDraft,
        async (eventData) => {
          handleStreamEvent(eventData, message.id)
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

    if (isSending) {
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

  function handleExportConversation() {
    const exportConversation =
      currentConversation ?? pendingConversation
    if (!exportConversation || messages.length === 0) {
      return
    }

    const markdown = buildConversationMarkdown(
      exportConversation,
      messages,
      locale,
      t,
    )
    downloadTextFile(
      buildConversationExportFilename(
        exportConversation.title,
        t('chat.exportDefaultTitle'),
      ),
      markdown,
    )
  }

  async function handleImportConversation(file: File) {
    setIsImporting(true)
    setChatError(null)

    try {
      const content = await file.text()
      const payload = parseConversationMarkdownImport(
        content,
        file.name,
        t('chat.exportDefaultTitle'),
      )
      const importedConversation = await chatApi.importConversation(payload)

      setSkipAutoResume(true)
      setPendingConversation(importedConversation)
      insertCreatedConversation(importedConversation)
      await loadConversations()
      navigateToConversation(importedConversation.id)
      showToast(t('settings.importSuccess'), 'success')

      return importedConversation
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.importConversation'),
      )
      throw error
    } finally {
      setIsImporting(false)
    }
  }

  function resetForNewChat() {
    activeConversationIdRef.current = null
    setChatError(null)
    setMessages([])
    setHasMoreMessages(false)
    setNextBeforeMessageId(null)
    setIsLoadingOlderMessages(false)
    resetForNewChatSettings()
    resetComposer()
  }

  return {
    composerFormRef,
    fileInputRef,
    messageViewportRef,
    composerIsComposingRef,
    messages,
    composerValue,
    chatSettingsDraft,
    conversationFolderDraft,
    conversationTagsDraft,
    selectedAttachments,
    settingsDraft,
    pendingConversation,
    editingMessageId,
    isLoadingMessages,
    isSending,
    isImporting,
    hasMoreMessages,
    nextBeforeMessageId,
    isLoadingOlderMessages,
    latestUserMessage,
    latestAssistantMessage,
    hasPendingUploads,
    canSubmitComposer,
    setComposerValue,
    setChatSettingsDraft,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setSettingsDraft,
    resetSettingsDraft,
    syncSettingsDraft,
    handleExportConversation,
    handleImportConversation,
    loadOlderMessages,
    handleFilesSelected,
    handleRegenerateAssistant,
    handleRetryAssistant,
    handleSaveSettings,
    handleStopGeneration,
    handleSubmit,
    removeSelectedAttachment,
    resetForNewChat,
    startEditingMessage,
    cancelEditingMessage,
  }
}
