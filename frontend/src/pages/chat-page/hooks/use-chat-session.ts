import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import { createLocalISOString } from '../../../lib/utils'
import type {
  Attachment,
  Conversation,
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
  downloadTextFile,
  isConversationNotFoundError,
  isSameMessage,
  parseConversationMarkdownImport,
  upsertMessage,
  writeLastConversationId,
} from '../utils'
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
  syncConversationIntoList: (conversation: Conversation) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (conversationId: number, replace?: boolean) => void
  navigateHome: (replace?: boolean) => void
  setSkipAutoResume: (value: boolean) => void
  t: I18nContextValue['t']
  locale: string
}

export function useChatSession({
  activeConversationId,
  currentConversation,
  search,
  showArchived,
  setChatError,
  showToast,
  insertCreatedConversation,
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
    setMessages,
    setIsLoadingMessages,
    setIsSending,
  } = useChatMessagesState()
  const {
    pendingConversation,
    settingsDraft,
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

  const streamingConversationIdRef = useRef<number | null>(null)
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
    resetForNewChatSettings()
    clearEditingMessage()
    setChatError(null)
  }, [activeConversationId, clearEditingMessage, resetForNewChatSettings, setChatError, setMessages])

  useEffect(() => {
    if (
      !activeConversationId ||
      streamingConversationIdRef.current === activeConversationId
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

        setMessages(response.messages)
        setPendingConversation(response.conversation)
        setSettingsDraft(response.conversation.settings)
        syncConversationIntoListRef.current(
          resolveConversationForList(
            response.conversation,
            showArchivedRef.current,
            conversationSearchRef.current,
          ),
        )
        writeLastConversationId(response.conversation.id)
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
  }, [activeConversationId, setChatError, setIsLoadingMessages, setMessages, setPendingConversation, setSettingsDraft])

  function applyConversationSnapshot(
    response: {
      conversation: Conversation
      messages: Message[]
    },
    replaceMessages: boolean,
  ) {
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
    writeLastConversationId(response.conversation.id)
  }

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

  function handleStreamEvent(event: StreamEvent, placeholderId: number) {
    const eventMessage = event.message

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
      if (event.type === 'cancelled') {
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
    setIsSending(true)
    setChatError(null)

    const optimisticAssistantId = -(Date.now() + 1)
    let conversationId = activeConversationId

    try {
      let conversation = currentConversation

      if (!conversationId) {
        const createdConversation = await chatApi.createConversation()
        const configuredConversation = await chatApi.updateConversation(
          createdConversation.id,
          {
            settings: settingsDraft,
          },
        )
        conversation = configuredConversation
        conversationId = configuredConversation.id
        streamingConversationIdRef.current = conversationId
        activeConversationIdRef.current = conversationId
        setPendingConversation(configuredConversation)
        insertCreatedConversation(configuredConversation)
        navigateToConversation(conversationId)
      } else {
        streamingConversationIdRef.current = conversationId
      }

      const conversationSettings =
        conversation?.settings ?? settingsDraft
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
      )

      await reconcileConversationState(conversationId)
      await loadConversations()
    } catch (error) {
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
      if (conversationId) {
        await reconcileConversationState(conversationId, {
          clearErrorOnSuccess: false,
        })
      }
    } finally {
      streamingConversationIdRef.current = null
      setIsSending(false)
    }
  }

  async function handleEditSubmit(
    conversationId: number,
    messageId: number,
    content: string,
    attachments: Attachment[],
  ) {
    setIsSending(true)
    setChatError(null)
    streamingConversationIdRef.current = conversationId
    const optimisticAssistantId = -(Date.now() + 1)

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
      )

      await reconcileConversationState(conversationId)
      await loadConversations()
    } catch (error) {
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
      streamingConversationIdRef.current = null
      setIsSending(false)
    }
  }

  async function handleRetryAssistant(message: Message) {
    if (!activeConversationId || isSending) {
      return
    }

    setIsSending(true)
    setChatError(null)
    streamingConversationIdRef.current = activeConversationId

    try {
      setMessages((previous) =>
        previous.map((item) =>
          item.id === message.id
            ? {
                ...item,
                content: '',
                status: 'streaming',
              }
            : item,
        ),
      )

      await chatApi.retryMessage(
        activeConversationId,
        message.id,
        settingsDraft,
        async (eventData) => {
          handleStreamEvent(eventData, message.id)
        },
      )

      await reconcileConversationState(activeConversationId)
      await loadConversations()
    } catch (error) {
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
      await reconcileConversationState(activeConversationId, {
        clearErrorOnSuccess: false,
      })
    } finally {
      streamingConversationIdRef.current = null
      setIsSending(false)
    }
  }

  async function handleRegenerateAssistant() {
    if (
      !activeConversationId ||
      !latestAssistantMessage ||
      isSending
    ) {
      return
    }

    setIsSending(true)
    setChatError(null)
    streamingConversationIdRef.current = activeConversationId

    try {
      setMessages((previous) =>
        previous.map((item) =>
          item.id === latestAssistantMessage.id
            ? {
                ...item,
                content: '',
                status: 'streaming',
              }
            : item,
        ),
      )

      await chatApi.regenerateMessage(
        activeConversationId,
        settingsDraft,
        async (eventData) => {
          handleStreamEvent(eventData, latestAssistantMessage.id)
        },
      )

      await reconcileConversationState(activeConversationId)
      await loadConversations()
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.regenerateReply'),
      )
      setMessages((previous) =>
        previous.map((item) =>
          item.id === latestAssistantMessage.id
            ? {
                ...item,
                status: 'failed',
                content: item.content || t('error.completeReply'),
              }
            : item,
        ),
      )
      await reconcileConversationState(activeConversationId, {
        clearErrorOnSuccess: false,
      })
    } finally {
      streamingConversationIdRef.current = null
      setIsSending(false)
    }
  }

  async function handleStopGeneration() {
    if (!activeConversationId || !isSending) {
      return
    }

    try {
      await chatApi.cancelGeneration(activeConversationId)
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.stopGeneration'),
      )
    }
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
    selectedAttachments,
    settingsDraft,
    pendingConversation,
    editingMessageId,
    isLoadingMessages,
    isSending,
    isImporting,
    latestUserMessage,
    latestAssistantMessage,
    hasPendingUploads,
    canSubmitComposer,
    setComposerValue,
    setSettingsDraft,
    resetSettingsDraft,
    syncSettingsDraft,
    handleExportConversation,
    handleImportConversation,
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

function resolveConversationForList(
  conversation: Conversation,
  showArchived: boolean,
  search: string,
) {
  if (
    conversation.isArchived !== showArchived ||
    (search &&
      !conversation.title.toLowerCase().includes(search.toLowerCase()))
  ) {
    return {
      ...conversation,
      isArchived: conversation.isArchived,
    }
  }

  return conversation
}
