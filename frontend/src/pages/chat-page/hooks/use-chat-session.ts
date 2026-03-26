import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import { attachmentApi, chatApi } from '../../../lib/api'
import type { I18nContextValue } from '../../../i18n/context'
import { createLocalISOString } from '../../../lib/utils'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  Message,
  StreamEvent,
} from '../../../types/chat'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENTS,
  defaultConversationSettings,
  type ComposerImage,
  type ToastVariant,
} from '../types'
import {
  appendToStreamingMessage,
  buildAttachmentPayload,
  buildConversationMarkdown,
  clearLastConversationId,
  cleanupComposerImages,
  createComposerImagesFromAttachments,
  createImageDraft,
  downloadTextFile,
  findLatestMessageByRole,
  isConversationNotFoundError,
  isSameMessage,
  slugify,
  upsertMessage,
  writeLastConversationId,
} from '../utils'

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
  const composerFormRef = useRef<HTMLFormElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageViewportRef = useRef<HTMLDivElement | null>(null)
  const composerIsComposingRef = useRef(false)
  const selectedImagesRef = useRef<ComposerImage[]>([])
  const streamingConversationIdRef = useRef<number | null>(null)
  const activeConversationIdRef = useRef<number | null>(null)
  const conversationSearchRef = useRef(search)
  const showArchivedRef = useRef(showArchived)
  const syncConversationIntoListRef = useRef(syncConversationIntoList)
  const navigateHomeRef = useRef(navigateHome)
  const setSkipAutoResumeRef = useRef(setSkipAutoResume)
  const tRef = useRef(t)

  // Keep the latest list-filter and navigation state available to async work
  // without retriggering message fetches for the same conversation.
  conversationSearchRef.current = search
  showArchivedRef.current = showArchived
  syncConversationIntoListRef.current = syncConversationIntoList
  navigateHomeRef.current = navigateHome
  setSkipAutoResumeRef.current = setSkipAutoResume
  tRef.current = t

  const [messages, setMessages] = useState<Message[]>([])
  const [composerValue, setComposerValue] = useState('')
  const [selectedImages, setSelectedImages] = useState<ComposerImage[]>([])
  const [newChatSettings, setNewChatSettings] = useState<ConversationSettings>(
    defaultConversationSettings,
  )
  const [pendingConversation, setPendingConversation] =
    useState<Conversation | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<ConversationSettings>(
    defaultConversationSettings,
  )
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const latestUserMessage = findLatestMessageByRole(messages, 'user')
  const latestAssistantMessage = findLatestMessageByRole(messages, 'assistant')
  const hasPendingUploads = selectedImages.some((image) => image.isUploading)
  const canSubmitComposer =
    !isSending &&
    !hasPendingUploads &&
    (composerValue.trim().length > 0 || selectedImages.length > 0)

  useEffect(() => {
    selectedImagesRef.current = selectedImages
  }, [selectedImages])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    if (activeConversationId) {
      return
    }

    setMessages([])
    setPendingConversation(null)
    setChatError(null)
    setEditingMessageId(null)
    setSettingsDraft(newChatSettings)
  }, [activeConversationId, newChatSettings, setChatError])

  useEffect(() => {
    if (!activeConversationId || streamingConversationIdRef.current === activeConversationId) {
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
  }, [activeConversationId, setChatError])

  useEffect(() => {
    const viewport = messageViewportRef.current
    if (!viewport) {
      return
    }
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  useEffect(() => {
    return () => {
      cleanupComposerImages(selectedImagesRef.current)
    }
  }, [])

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

  function clearSelectedImages() {
    setSelectedImages((previous) => {
      cleanupComposerImages(previous)
      return []
    })
  }

  function replaceSelectedImages(nextImages: ComposerImage[]) {
    setSelectedImages((previous) => {
      cleanupComposerImages(previous)
      return nextImages
    })
  }

  async function uploadSelectedImages(files: File[]) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setChatError(t('error.onlyImages'))
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setChatError(t('error.imageTooLarge', { name: file.name }))
        continue
      }
      if (selectedImagesRef.current.length >= MAX_IMAGE_ATTACHMENTS) {
        setChatError(t('error.maxImages', { count: MAX_IMAGE_ATTACHMENTS }))
        break
      }

      const draftImage = createImageDraft(file)
      setSelectedImages((previous) => [...previous, draftImage])

      try {
        const attachment = await attachmentApi.upload(file)
        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === draftImage.id
              ? {
                  ...image,
                  attachment,
                  isUploading: false,
                }
              : image,
          ),
        )
        setChatError(null)
      } catch (error) {
        setSelectedImages((previous) => {
          const failedImage = previous.find((image) => image.id === draftImage.id)
          if (failedImage?.revokeOnCleanup) {
            URL.revokeObjectURL(failedImage.previewUrl)
          }
          return previous.filter((image) => image.id !== draftImage.id)
        })

        const message =
          error instanceof Error
            ? error.message
            : t('error.uploadImageGeneric')
        setChatError(message || t('error.uploadImage', { name: file.name }))
        showToast(
          message || t('error.uploadImage', { name: file.name }),
          'error',
        )
      }
    }
  }

  function removeSelectedImage(id: string) {
    setSelectedImages((previous) => {
      const image = previous.find((item) => item.id === id)
      if (image?.revokeOnCleanup) {
        URL.revokeObjectURL(image.previewUrl)
      }
      return previous.filter((item) => item.id !== id)
    })
  }

  function startEditingMessage(message: Message) {
    if (message.role !== 'user') {
      return
    }

    setEditingMessageId(message.id)
    setComposerValue(message.content)
    replaceSelectedImages(createComposerImagesFromAttachments(message.attachments))
  }

  function cancelEditingMessage() {
    setEditingMessageId(null)
    setComposerValue('')
    clearSelectedImages()
  }

  function handleStreamEvent(event: StreamEvent, placeholderId: number) {
    const eventMessage = event.message

    if (event.type === 'message_start' && eventMessage) {
      setMessages((previous) =>
        upsertMessage(previous, eventMessage, placeholderId),
      )
      return
    }

    const delta = event.content
    if (event.type === 'delta' && typeof delta === 'string') {
      setMessages((previous) => appendToStreamingMessage(previous, delta))
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
              content: eventMessage?.content || message.content || t('error.assistantEndedUnexpectedly'),
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

      const conversationSettings = conversation?.settings ?? settingsDraft
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
      setComposerValue('')
      clearSelectedImages()
      setEditingMessageId(null)

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

      setComposerValue('')
      clearSelectedImages()
      setEditingMessageId(null)

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
    if (!activeConversationId || !latestAssistantMessage || isSending) {
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
      const attachments = await buildAttachmentPayload(selectedImages, t)
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

  async function handleSaveSettings(onSaved: () => void) {
    if (!activeConversationId) {
      setNewChatSettings(settingsDraft)
      onSaved()
      return
    }

    setChatError(null)

    try {
      const updatedConversation = await chatApi.updateConversation(
        activeConversationId,
        {
          settings: settingsDraft,
        },
      )
      syncConversationIntoList(updatedConversation)
      setPendingConversation(updatedConversation)
      setSettingsDraft(updatedConversation.settings)
      onSaved()
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.saveSettings'),
      )
    }
  }

  function handleExportConversation() {
    const exportConversation = currentConversation ?? pendingConversation
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
      `${slugify(exportConversation.title || t('chat.exportDefaultTitle'))}.md`,
      markdown,
    )
  }

  function resetForNewChat() {
    activeConversationIdRef.current = null
    setEditingMessageId(null)
    setChatError(null)
    setMessages([])
    setPendingConversation(null)
    setComposerValue('')
    clearSelectedImages()
    setSettingsDraft(newChatSettings)
  }

  function syncSettingsDraft() {
    if (currentConversation) {
      setSettingsDraft(currentConversation.settings)
      return
    }
    setSettingsDraft(newChatSettings)
  }

  function resetSettingsDraft() {
    syncSettingsDraft()
  }

  return {
    composerFormRef,
    fileInputRef,
    messageViewportRef,
    composerIsComposingRef,
    messages,
    composerValue,
    selectedImages,
    settingsDraft,
    pendingConversation,
    editingMessageId,
    isLoadingMessages,
    isSending,
    latestUserMessage,
    latestAssistantMessage,
    hasPendingUploads,
    canSubmitComposer,
    setComposerValue,
    setSettingsDraft,
    resetSettingsDraft,
    syncSettingsDraft,
    handleExportConversation,
    handleFilesSelected: uploadSelectedImages,
    handleRegenerateAssistant,
    handleRetryAssistant,
    handleSaveSettings,
    handleStopGeneration,
    handleSubmit,
    removeSelectedImage,
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
