import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Plus,
  SendHorizonal,
  Server,
  Trash2,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import type { I18nContextValue } from '../i18n/context'
import { LanguageSwitcher } from '../i18n/language-switcher'
import { useI18n } from '../i18n/use-i18n'
import { chatApi, providerApi } from '../lib/api'
import {
  cn,
  createLocalISOString,
  formatConversationDate,
} from '../lib/utils'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  Message,
  ProviderPreset,
  ProviderState,
  StreamEvent,
} from '../types/chat'

const MAX_IMAGE_ATTACHMENTS = 4
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
const CONVERSATION_PAGE_SIZE = 20
const LAST_CONVERSATION_STORAGE_KEY = 'aichat:last-conversation-id'
const DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY =
  'aichat:desktop-sidebar-collapsed'
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'

interface ComposerImage {
  id: string
  name: string
  mimeType: string
  size: number
  previewUrl: string
  sourceUrl?: string
  file?: File
  revokeOnCleanup: boolean
}

type SettingsTab = 'chat' | 'provider'

interface ProviderFormState {
  name: string
  baseURL: string
  apiKey: string
  defaultModel: string
}

const defaultConversationSettings: ConversationSettings = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  model: '',
  temperature: 1,
  maxTokens: null,
}

const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export function ChatPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const composerFormRef = useRef<HTMLFormElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const messageViewportRef = useRef<HTMLDivElement | null>(null)
  const composerIsComposingRef = useRef(false)
  const selectedImagesRef = useRef<ComposerImage[]>([])
  const skipAutoResumeRef = useRef(false)
  const streamingConversationIdRef = useRef<number | null>(null)
  const activeConversationId = params.conversationId
    ? Number(params.conversationId)
    : null

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(
    () => readDesktopSidebarCollapsedPreference(),
  )
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationTotal, setConversationTotal] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [composerValue, setComposerValue] = useState('')
  const [selectedImages, setSelectedImages] = useState<ComposerImage[]>([])
  const [conversationSearch, setConversationSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<ConversationSettings>(
    defaultConversationSettings,
  )
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('chat')
  const [providerState, setProviderState] = useState<ProviderState | null>(null)
  const [providerForm, setProviderForm] = useState<ProviderFormState>(
    createProviderForm(),
  )
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null)
  const [isLoadingProviders, setIsLoadingProviders] = useState(false)
  const [isSavingProvider, setIsSavingProvider] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const deferredConversationSearch = useDeferredValue(conversationSearch.trim())

  const currentConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    null
  const latestUserMessage = findLatestMessageByRole(messages, 'user')
  const latestAssistantMessage = findLatestMessageByRole(messages, 'assistant')
  const canSubmitComposer =
    !isSending &&
    (composerValue.trim().length > 0 || selectedImages.length > 0)

  useEffect(() => {
    let cancelled = false

    async function fetchConversations() {
      try {
        setIsLoadingConversations(true)

        const result = await chatApi.listConversationsPage({
          search: deferredConversationSearch || undefined,
          archived: showArchived,
          limit: CONVERSATION_PAGE_SIZE,
          offset: 0,
        })

        if (cancelled) {
          return
        }

        setConversations(sortConversations(result.conversations))
        setConversationTotal(result.total)
      } catch (error) {
        if (cancelled) {
          return
        }

        setChatError(
          error instanceof Error
            ? error.message
            : t('error.loadConversations'),
        )
      } finally {
        if (!cancelled) {
          setIsLoadingConversations(false)
        }
      }
    }

    void fetchConversations()

    return () => {
      cancelled = true
    }
  }, [deferredConversationSearch, showArchived, t])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      setChatError(null)
      setEditingMessageId(null)
      setSettingsDraft(defaultConversationSettings)
      return
    }

    if (streamingConversationIdRef.current === activeConversationId) {
      return
    }

    const targetConversationId = activeConversationId

    async function syncMessages() {
      try {
        setIsLoadingMessages(true)
        setChatError(null)
        const response =
          await chatApi.getConversationMessages(targetConversationId)
        setMessages(response.messages)
        setConversations((previous) => {
          const filtered = previous.filter(
            (item) => item.id !== response.conversation.id,
          )
          if (
            response.conversation.isArchived !== showArchived ||
            (deferredConversationSearch &&
              !response.conversation.title
                .toLowerCase()
                .includes(deferredConversationSearch.toLowerCase()))
          ) {
            return sortConversations(filtered)
          }
          return sortConversations([response.conversation, ...filtered])
        })
        setSettingsDraft(response.conversation.settings)
        localStorage.setItem(
          LAST_CONVERSATION_STORAGE_KEY,
          String(targetConversationId),
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t('error.loadMessages')
        setChatError(message)
        setMessages([])
        if (message.toLowerCase().includes('not found')) {
          navigate('/chat', { replace: true })
        }
      } finally {
        setIsLoadingMessages(false)
      }
    }

    void syncMessages()
  }, [activeConversationId, deferredConversationSearch, navigate, showArchived, t])

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
    selectedImagesRef.current = selectedImages
  }, [selectedImages])

  useEffect(() => {
    return () => {
      cleanupComposerImages(selectedImagesRef.current)
    }
  }, [])

  useEffect(() => {
    if (activeConversationId) {
      skipAutoResumeRef.current = false
      localStorage.setItem(
        LAST_CONVERSATION_STORAGE_KEY,
        String(activeConversationId),
      )
    }
  }, [activeConversationId])

  useEffect(() => {
    window.localStorage.setItem(
      DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      JSON.stringify(isDesktopSidebarCollapsed),
    )
  }, [isDesktopSidebarCollapsed])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    let cancelled = false

    async function fetchProviderState() {
      try {
        setIsLoadingProviders(true)
        const nextState = await providerApi.list()
        if (cancelled) {
          return
        }
        applyProviderState(nextState)
      } catch (error) {
        if (cancelled) {
          return
        }
        setChatError(
          error instanceof Error
            ? error.message
            : t('error.loadProviders'),
        )
      } finally {
        if (!cancelled) {
          setIsLoadingProviders(false)
        }
      }
    }

    void fetchProviderState()

    return () => {
      cancelled = true
    }
  }, [isSettingsOpen, t])

  useEffect(() => {
    if (
      activeConversationId ||
      isLoadingConversations ||
      showArchived ||
      deferredConversationSearch !== '' ||
      skipAutoResumeRef.current
    ) {
      return
    }

    const lastConversationId = Number(
      localStorage.getItem(LAST_CONVERSATION_STORAGE_KEY),
    )
    if (!lastConversationId) {
      return
    }

    const hasConversation = conversations.some(
      (conversation) => conversation.id === lastConversationId,
    )
    if (hasConversation) {
      navigate(`/chat/${lastConversationId}`, { replace: true })
    }
  }, [
    activeConversationId,
    conversations,
    deferredConversationSearch,
    isLoadingConversations,
    navigate,
    showArchived,
  ])

  async function loadConversations({ append = false }: { append?: boolean } = {}) {
    try {
      if (append) {
        setIsLoadingMoreConversations(true)
      } else {
        setIsLoadingConversations(true)
      }

      const result = await chatApi.listConversationsPage({
        search: deferredConversationSearch || undefined,
        archived: showArchived,
        limit: CONVERSATION_PAGE_SIZE,
        offset: append ? conversations.length : 0,
      })

      setConversations((previous) =>
        append
          ? sortConversations(
              dedupeConversations([...previous, ...result.conversations]),
            )
          : sortConversations(result.conversations),
      )
      setConversationTotal(result.total)
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.loadConversations'),
      )
    } finally {
      setIsLoadingConversations(false)
      setIsLoadingMoreConversations(false)
    }
  }

  function syncConversationIntoList(conversation: Conversation) {
    setConversations((previous) => {
      const filtered = previous.filter((item) => item.id !== conversation.id)
      if (
        conversation.isArchived !== showArchived ||
        (deferredConversationSearch &&
          !conversation.title
            .toLowerCase()
            .includes(deferredConversationSearch.toLowerCase()))
      ) {
        return sortConversations(filtered)
      }
      return sortConversations([conversation, ...filtered])
    })
  }

  function handleOpenImagePicker() {
    inputRef.current?.click()
  }

  function applyProviderState(
    nextState: ProviderState,
    preferredPresetId: number | null = editingProviderId,
  ) {
    setProviderState(nextState)

    const preferredPreset =
      nextState.presets.find((preset) => preset.id === preferredPresetId) ?? null
    const activePreset =
      nextState.presets.find((preset) => preset.isActive) ?? null
    const nextPreset = preferredPreset ?? activePreset

    if (nextPreset) {
      setEditingProviderId(nextPreset.id)
      setProviderForm(createProviderForm(nextState.fallback, nextPreset))
      return
    }

    setEditingProviderId(null)
    setProviderForm(createProviderForm(nextState.fallback))
  }

  function handleOpenSettings() {
    setActiveSettingsTab('chat')
    setIsSettingsOpen(true)
  }

  function handleStartNewProvider() {
    setEditingProviderId(null)
    setProviderForm(createProviderForm(providerState?.fallback))
  }

  function handleEditProvider(preset: ProviderPreset) {
    setEditingProviderId(preset.id)
    setProviderForm(createProviderForm(providerState?.fallback, preset))
  }

  async function handleSaveProvider() {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = editingProviderId
        ? await providerApi.update(editingProviderId, {
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            defaultModel: providerForm.defaultModel,
            ...(providerForm.apiKey.trim()
              ? { apiKey: providerForm.apiKey }
              : {}),
          })
        : await providerApi.create({
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            apiKey: providerForm.apiKey,
            defaultModel: providerForm.defaultModel,
          })

      applyProviderState(nextState, editingProviderId ?? nextState.activePresetId)
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.saveProviderSettings'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function handleActivateProvider(providerId: number) {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = await providerApi.activate(providerId)
      applyProviderState(nextState, providerId)
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.activateProviderPreset'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function handleDeleteProvider(preset: ProviderPreset) {
    const confirmed = window.confirm(
      t('confirm.deleteProviderPreset', { name: preset.name }),
    )
    if (!confirmed) {
      return
    }

    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = await providerApi.delete(preset.id)
      applyProviderState(
        nextState,
        editingProviderId === preset.id ? null : editingProviderId,
      )
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.deleteProviderPreset'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    const nextImages: ComposerImage[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setChatError(t('error.onlyImages'))
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setChatError(t('error.imageTooLarge', { name: file.name }))
        continue
      }
      nextImages.push({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        file,
        revokeOnCleanup: true,
      })
    }

    if (nextImages.length === 0) {
      event.target.value = ''
      return
    }

    setSelectedImages((previous) => {
      const mergedImages = dedupeComposerImages([...previous, ...nextImages])
      const keptImages = mergedImages.slice(0, MAX_IMAGE_ATTACHMENTS)

      for (const image of mergedImages.slice(MAX_IMAGE_ATTACHMENTS)) {
        if (image.revokeOnCleanup) {
          URL.revokeObjectURL(image.previewUrl)
        }
      }

      if (mergedImages.length > MAX_IMAGE_ATTACHMENTS) {
        setChatError(
          t('error.maxImages', { count: MAX_IMAGE_ATTACHMENTS }),
        )
      } else {
        setChatError(null)
      }

      return keptImages
    })
    event.target.value = ''
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

  function handleCreateNewChat() {
    if (isSending) {
      return
    }
    skipAutoResumeRef.current = true
    setSidebarOpen(false)
    setShowArchived(false)
    setEditingMessageId(null)
    setChatError(null)
    setMessages([])
    setComposerValue('')
    clearSelectedImages()
    setSettingsDraft(defaultConversationSettings)
    navigate('/chat')
  }

  async function handleDeleteConversation(conversationId: number) {
    const confirmed = window.confirm(t('confirm.deleteConversation'))
    if (!confirmed) {
      return
    }

    try {
      await chatApi.deleteConversation(conversationId)
      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== conversationId),
      )
      setConversationTotal((previous) => Math.max(previous - 1, 0))
      if (activeConversationId === conversationId) {
        navigate('/chat', { replace: true })
        setMessages([])
      }
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.deleteConversation'),
      )
    }
  }

  async function handleRenameConversation(conversation: Conversation) {
    const nextTitle = window.prompt(
      t('prompt.renameConversation'),
      conversation.title,
    )
    if (nextTitle === null) {
      return
    }

    try {
      const updatedConversation = await chatApi.updateConversation(conversation.id, {
        title: nextTitle,
      })
      syncConversationIntoList(updatedConversation)
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.renameConversation'),
      )
    }
  }

  async function handleTogglePinned(conversation: Conversation) {
    try {
      const updatedConversation = await chatApi.updateConversation(conversation.id, {
        isPinned: !conversation.isPinned,
      })
      syncConversationIntoList(updatedConversation)
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.updateConversation'),
      )
    }
  }

  async function handleToggleArchived(conversation: Conversation) {
    try {
      const nextArchived = !conversation.isArchived
      const updatedConversation = await chatApi.updateConversation(conversation.id, {
        isArchived: nextArchived,
      })

      if (nextArchived === showArchived) {
        syncConversationIntoList(updatedConversation)
      } else {
        setConversations((previous) =>
          previous.filter((item) => item.id !== conversation.id),
        )
      }

      if (activeConversationId === conversation.id && nextArchived !== showArchived) {
        navigate('/chat', { replace: true })
        setMessages([])
      }
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.archiveConversation'),
      )
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
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
        await handleEditSubmit(activeConversationId, editingMessageId, content, attachments)
        return
      }

      await handleSendSubmit(content, attachments)
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.prepareMessage'),
      )
    }
  }

  async function handleSendSubmit(content: string, attachments: Attachment[]) {
    setIsSending(true)
    setChatError(null)

    const optimisticAssistantId = -(Date.now() + 1)

    try {
      let conversation = currentConversation
      let conversationId = activeConversationId

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
        syncConversationIntoList(configuredConversation)
        navigate(`/chat/${conversationId}`)
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

  async function handleSaveSettings() {
    setIsSavingSettings(true)
    setChatError(null)

    try {
      if (activeConversationId) {
        const updatedConversation = await chatApi.updateConversation(
          activeConversationId,
          {
            settings: settingsDraft,
          },
        )
        syncConversationIntoList(updatedConversation)
        setSettingsDraft(updatedConversation.settings)
      }
      setIsSettingsOpen(false)
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.saveSettings'),
      )
    } finally {
      setIsSavingSettings(false)
    }
  }

  function handleExportConversation() {
    if (!currentConversation || messages.length === 0) {
      return
    }

    const markdown = buildConversationMarkdown(
      currentConversation,
      messages,
      locale,
      t,
    )
    downloadTextFile(
      `${slugify(currentConversation.title || t('chat.exportDefaultTitle'))}.md`,
      markdown,
    )
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

  function handleComposerKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== 'Enter') {
      return
    }

    if (event.ctrlKey) {
      return
    }

    if (composerIsComposingRef.current || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    if (!canSubmitComposer) {
      return
    }

    composerFormRef.current?.requestSubmit()
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

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--foreground)]">
      <MobileSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentConversationId={activeConversationId}
        conversations={conversations}
        total={conversationTotal}
        searchValue={conversationSearch}
        showArchived={showArchived}
        isLoading={isLoadingConversations}
        isLoadingMore={isLoadingMoreConversations}
        onSearchChange={setConversationSearch}
        onToggleArchived={setShowArchived}
        onLoadMore={() => void loadConversations({ append: true })}
        onSelectConversation={(conversationId) => {
          navigate(`/chat/${conversationId}`)
          setSidebarOpen(false)
        }}
        onRenameConversation={handleRenameConversation}
        onTogglePinned={handleTogglePinned}
        onToggleArchivedConversation={handleToggleArchived}
        onDeleteConversation={handleDeleteConversation}
        onCreateChat={handleCreateNewChat}
        username={user?.username ?? ''}
        onLogout={handleLogout}
      />

      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-[var(--line)] bg-[var(--sidebar-bg)] transition-[width] duration-200 md:flex',
          isDesktopSidebarCollapsed ? 'w-[72px]' : 'w-[320px]',
        )}
      >
        <SidebarContent
          collapsed={isDesktopSidebarCollapsed}
          currentConversationId={activeConversationId}
          conversations={conversations}
          total={conversationTotal}
          searchValue={conversationSearch}
          showArchived={showArchived}
          isLoading={isLoadingConversations}
          isLoadingMore={isLoadingMoreConversations}
          onSearchChange={setConversationSearch}
          onToggleArchived={setShowArchived}
          onLoadMore={() => void loadConversations({ append: true })}
          onSelectConversation={(conversationId) => navigate(`/chat/${conversationId}`)}
          onRenameConversation={handleRenameConversation}
          onTogglePinned={handleTogglePinned}
          onToggleArchivedConversation={handleToggleArchived}
          onDeleteConversation={handleDeleteConversation}
          onCreateChat={handleCreateNewChat}
          username={user?.username ?? ''}
          onLogout={handleLogout}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 md:px-8">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-black/5 md:hidden"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            aria-expanded={!isDesktopSidebarCollapsed}
            aria-label={
              isDesktopSidebarCollapsed
                ? t('chat.expandSidebar')
                : t('chat.collapseSidebar')
            }
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)] md:inline-flex"
            onClick={() =>
              setIsDesktopSidebarCollapsed((previous) => !previous)
            }
            title={
              isDesktopSidebarCollapsed
                ? t('chat.expandSidebar')
                : t('chat.collapseSidebar')
            }
            type="button"
          >
            {isDesktopSidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium text-[var(--foreground)]">
              {currentConversation?.title ?? t('chat.newConversation')}
            </h1>
            {currentConversation ? (
              <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                {currentConversation.settings.model || t('chat.defaultModel')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <Button
              className="px-3 py-2"
              disabled={messages.length === 0}
              onClick={handleExportConversation}
              variant="secondary"
            >
              {t('chat.export')}
            </Button>
            <Button
              className="px-3 py-2"
              onClick={handleOpenSettings}
              variant="secondary"
            >
              {t('chat.settings')}
            </Button>
            {latestAssistantMessage && !isSending ? (
              <Button
                className="px-3 py-2"
                onClick={() => void handleRegenerateAssistant()}
                variant="secondary"
              >
                {t('chat.regenerate')}
              </Button>
            ) : null}
            {isSending ? (
              <Button
                className="px-3 py-2"
                onClick={() => void handleStopGeneration()}
                variant="danger"
              >
                {t('chat.stop')}
              </Button>
            ) : null}
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto px-4 py-8 md:px-8 md:py-10"
          ref={messageViewportRef}
        >
          {activeConversationId && isLoadingMessages ? (
            <div className="px-2 py-8 text-sm text-[var(--muted-foreground)]">
              {t('chat.loadingConversation')}
            </div>
          ) : messages.length > 0 ? (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  canEdit={
                    !isSending &&
                    latestUserMessage?.id === message.id &&
                    message.role === 'user'
                  }
                  canRetry={
                    !isSending &&
                    latestAssistantMessage?.id === message.id &&
                    message.role === 'assistant' &&
                    (message.status === 'failed' || message.status === 'cancelled')
                  }
                  canRegenerate={
                    !isSending &&
                    latestAssistantMessage?.id === message.id &&
                    message.role === 'assistant' &&
                    message.status === 'completed'
                  }
                  isEditing={editingMessageId === message.id}
                  message={message}
                  onEdit={() => startEditingMessage(message)}
                  onRegenerate={() => void handleRegenerateAssistant()}
                  onRetry={() => void handleRetryAssistant(message)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              hasConversations={conversations.length > 0}
              onContinueLast={() => {
                const lastConversationId = Number(
                  localStorage.getItem(LAST_CONVERSATION_STORAGE_KEY),
                )
                if (lastConversationId) {
                  navigate(`/chat/${lastConversationId}`)
                }
              }}
            />
          )}
        </div>

        <footer className="border-t border-[var(--line)] bg-[var(--app-bg)] px-4 py-4 md:px-8 md:py-5">
          <div className="mx-auto max-w-3xl space-y-3">
            {editingMessageId ? (
              <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--muted-foreground)]">
                <span>{t('chat.editingBanner')}</span>
                <Button onClick={cancelEditingMessage} variant="ghost">
                  {t('common.cancel')}
                </Button>
              </div>
            ) : null}

            {selectedImages.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {selectedImages.map((image) => (
                  <div
                    key={image.id}
                    className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-white p-1"
                  >
                    <img
                      alt={image.name}
                      className="h-20 w-20 rounded-lg object-cover"
                      src={image.previewUrl}
                    />
                    <button
                      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                      onClick={() => removeSelectedImage(image.id)}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <form
              className="rounded-2xl border border-[var(--line)] bg-white p-3 shadow-[var(--shadow-md)]"
              ref={composerFormRef}
              onSubmit={handleSubmit}
            >
              <Textarea
                className="min-h-[96px] p-2 text-[15px]"
                onChange={(event) => setComposerValue(event.target.value)}
                onCompositionEnd={() => {
                  composerIsComposingRef.current = false
                }}
                onCompositionStart={() => {
                  composerIsComposingRef.current = true
                }}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  editingMessageId
                    ? t('chat.updateMessagePlaceholder')
                    : t('chat.messagePlaceholder')
                }
                value={composerValue}
              />
              <div className="flex items-center justify-between border-t border-[var(--line)] px-1 pt-2">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
                  onClick={handleOpenImagePicker}
                  type="button"
                  title={t('chat.attachImage')}
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <p className="px-3 text-xs text-[var(--muted-foreground)]">
                  {t('chat.shortcutHint')}
                </p>

                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white transition hover:bg-[var(--brand-strong)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canSubmitComposer}
                  type="submit"
                >
                  <SendHorizonal className="h-4 w-4" />
                </button>
              </div>
            </form>

            {chatError ? (
              <p className="px-1 text-sm text-[var(--danger)]">{chatError}</p>
            ) : null}
          </div>
        </footer>
      </main>

      <SettingsPanel
        activeTab={activeSettingsTab}
        editingProviderId={editingProviderId}
        isLoadingProviders={isLoadingProviders}
        isOpen={isSettingsOpen}
        isSavingProvider={isSavingProvider}
        isSaving={isSavingSettings}
        onClose={() => setIsSettingsOpen(false)}
        onDeleteProvider={handleDeleteProvider}
        onEditProvider={handleEditProvider}
        onProviderTabChange={setActiveSettingsTab}
        onReset={() => setSettingsDraft(defaultConversationSettings)}
        onResetProvider={handleStartNewProvider}
        onSave={() => void handleSaveSettings()}
        onSaveProvider={() => void handleSaveProvider()}
        onActivateProvider={(providerId) => void handleActivateProvider(providerId)}
        onStartNewProvider={handleStartNewProvider}
        providerForm={providerForm}
        providerState={providerState}
        setProviderForm={setProviderForm}
        settings={settingsDraft}
        setSettings={setSettingsDraft}
      />

      <input
        accept="image/*"
        className="hidden"
        multiple
        onChange={handleImageSelection}
        ref={inputRef}
        type="file"
      />
    </div>
  )
}

function SidebarContent({
  collapsed,
  currentConversationId,
  conversations,
  total,
  searchValue,
  showArchived,
  isLoading,
  isLoadingMore,
  onSearchChange,
  onToggleArchived,
  onLoadMore,
  onSelectConversation,
  onRenameConversation,
  onTogglePinned,
  onToggleArchivedConversation,
  onDeleteConversation,
  onCreateChat,
  username,
  onLogout,
}: {
  collapsed: boolean
  currentConversationId: number | null
  conversations: Conversation[]
  total: number
  searchValue: string
  showArchived: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onSearchChange: (value: string) => void
  onToggleArchived: (value: boolean) => void
  onLoadMore: () => void
  onSelectConversation: (conversationId: number) => void
  onRenameConversation: (conversation: Conversation) => void
  onTogglePinned: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: number) => void
  onCreateChat: () => void
  username: string
  onLogout: () => void
}) {
  const { locale, t } = useI18n()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={cn(
          'space-y-4 pb-4 pt-5 transition-[padding] duration-200',
          collapsed ? 'px-2' : 'px-4',
        )}
      >
        <div
          className={cn(
            'flex items-center',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <span
            className={cn(
              'text-sm font-semibold text-[var(--foreground)] transition-opacity duration-200',
              collapsed ? 'pointer-events-none w-0 overflow-hidden opacity-0' : 'opacity-100',
            )}
          >
            Claude
          </span>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
            onClick={onCreateChat}
            title={t('sidebar.newChat')}
            type="button"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>

        {!collapsed ? (
          <>
            <Input
              placeholder={t('sidebar.searchPlaceholder')}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <Button
                className="px-3 py-2"
                onClick={() => onToggleArchived(false)}
                variant={showArchived ? 'secondary' : 'primary'}
              >
                {t('sidebar.active')}
              </Button>
              <Button
                className="px-3 py-2"
                onClick={() => onToggleArchived(true)}
                variant={showArchived ? 'primary' : 'secondary'}
              >
                {t('sidebar.archived')}
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <div
        className={cn(
          'flex-1 overflow-y-auto pb-2',
          'px-2',
        )}
      >
        {!collapsed ? (
          <p className="mb-1 px-3 text-xs font-medium text-[var(--muted-foreground)]">
            {showArchived ? t('sidebar.archived') : t('sidebar.recents')}
          </p>
        ) : null}
        <div className="space-y-1">
          {isLoading ? (
            <div
              className={cn(
                'py-4 text-[var(--muted-foreground)]',
                collapsed ? 'px-0 text-center text-xs' : 'px-3 text-sm',
              )}
            >
              {t('common.loading')}
            </div>
          ) : conversations.length === 0 ? (
            <div
              className={cn(
                'py-4 text-[var(--muted-foreground)]',
                collapsed ? 'px-0 text-center text-xs' : 'px-3 text-sm',
              )}
            >
              {t('sidebar.noConversations')}
            </div>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.id === currentConversationId
              const monogram = getConversationMonogram(conversation.title)
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group rounded-xl border border-transparent transition-colors',
                    isActive
                      ? 'border-[var(--line)] bg-[var(--sidebar-accent)]'
                      : 'hover:bg-black/[0.04]',
                    collapsed ? 'p-1.5' : 'p-2',
                  )}
                >
                  <button
                    aria-label={conversation.title}
                    className={cn(
                      'w-full min-w-0',
                      collapsed
                        ? 'flex justify-center rounded-lg px-0 py-1.5 text-center'
                        : 'text-left',
                    )}
                    onClick={() => onSelectConversation(conversation.id)}
                    title={conversation.title}
                    type="button"
                  >
                    {collapsed ? (
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold',
                          isActive
                            ? 'border-[var(--line-strong)] bg-white text-[var(--foreground)]'
                            : 'border-transparent bg-white/60 text-[var(--muted-foreground)]',
                        )}
                      >
                        {monogram}
                      </div>
                    ) : (
                      <>
                        <div className="truncate text-sm font-medium text-[var(--foreground)]">
                          {conversation.isPinned ? t('sidebar.pinnedPrefix') : ''}
                          {conversation.title}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                          {formatConversationDate(conversation.updatedAt, locale)}
                        </div>
                      </>
                    )}
                  </button>

                  {!collapsed ? (
                    <div className="mt-2 flex flex-wrap gap-1 opacity-0 transition group-hover:opacity-100">
                      <Button
                        className="px-2 py-1 text-xs"
                        onClick={() => onTogglePinned(conversation)}
                        variant="ghost"
                      >
                        {conversation.isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
                      </Button>
                      <Button
                        className="px-2 py-1 text-xs"
                        onClick={() => onRenameConversation(conversation)}
                        variant="ghost"
                      >
                        {t('sidebar.rename')}
                      </Button>
                      <Button
                        className="px-2 py-1 text-xs"
                        onClick={() => onToggleArchivedConversation(conversation)}
                        variant="ghost"
                      >
                        {conversation.isArchived ? t('sidebar.restore') : t('sidebar.archive')}
                      </Button>
                      <button
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--danger)]"
                        onClick={() => onDeleteConversation(conversation.id)}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>

        {!collapsed && conversations.length < total ? (
          <div className="px-2 pt-3">
            <Button
              className="w-full"
              disabled={isLoadingMore}
              onClick={onLoadMore}
              variant="secondary"
            >
              {isLoadingMore ? t('common.loading') : t('common.loadMore')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className={cn('border-t border-[var(--line)] py-4', collapsed ? 'px-2' : 'px-3')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sidebar-accent)] text-sm font-semibold text-[var(--foreground)]"
              title={username}
            >
              {username[0]?.toUpperCase() ?? 'U'}
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
              onClick={onLogout}
              title={t('sidebar.signOut')}
              type="button"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-accent)] text-sm font-semibold text-[var(--foreground)]">
              {username[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="flex-1 truncate text-sm font-medium text-[var(--foreground)]">
              {username}
            </span>
            <button
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
              onClick={onLogout}
              title={t('sidebar.signOut')}
              type="button"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MobileSidebar({
  isOpen,
  onClose,
  ...props
}: {
  isOpen: boolean
  onClose: () => void
  currentConversationId: number | null
  conversations: Conversation[]
  total: number
  searchValue: string
  showArchived: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onSearchChange: (value: string) => void
  onToggleArchived: (value: boolean) => void
  onLoadMore: () => void
  onSelectConversation: (conversationId: number) => void
  onRenameConversation: (conversation: Conversation) => void
  onTogglePinned: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: number) => void
  onCreateChat: () => void
  username: string
  onLogout: () => void
}) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-30 bg-black/25 opacity-0 transition md:hidden',
        isOpen && 'pointer-events-auto opacity-100',
      )}
    >
      <button
        className="absolute inset-0 h-full w-full"
        onClick={onClose}
        type="button"
      />
      <div
        className={cn(
          'absolute inset-y-0 left-0 w-[88vw] max-w-[320px] -translate-x-full bg-[var(--sidebar-bg)] shadow-xl transition-transform duration-200',
          isOpen && 'translate-x-0',
        )}
      >
        <SidebarContent collapsed={false} {...props} />
      </div>
    </div>
  )
}

function SettingsPanel({
  activeTab,
  editingProviderId,
  isLoadingProviders,
  isOpen,
  isSavingProvider,
  isSaving,
  onActivateProvider,
  settings,
  providerForm,
  providerState,
  setSettings,
  setProviderForm,
  onClose,
  onDeleteProvider,
  onEditProvider,
  onProviderTabChange,
  onReset,
  onResetProvider,
  onSave,
  onSaveProvider,
  onStartNewProvider,
}: {
  activeTab: SettingsTab
  editingProviderId: number | null
  isLoadingProviders: boolean
  isOpen: boolean
  isSavingProvider: boolean
  isSaving: boolean
  onActivateProvider: (providerId: number) => void
  settings: ConversationSettings
  providerForm: ProviderFormState
  providerState: ProviderState | null
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
  setProviderForm: Dispatch<SetStateAction<ProviderFormState>>
  onClose: () => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onEditProvider: (preset: ProviderPreset) => void
  onProviderTabChange: (tab: SettingsTab) => void
  onReset: () => void
  onResetProvider: () => void
  onSave: () => void
  onSaveProvider: () => void
  onStartNewProvider: () => void
}) {
  const { t } = useI18n()

  if (!isOpen) {
    return null
  }

  const activePreset =
    providerState?.presets.find((preset) => preset.isActive) ?? null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-['Lora',serif] text-2xl font-bold tracking-tight">
              {t('settings.title')}
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
              {activeTab === 'chat'
                ? t('settings.chatDescription')
                : t('settings.providerDescription')}
            </p>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-black/5"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 inline-flex rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] p-1">
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'chat'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('chat')}
            type="button"
          >
            {t('settings.chatTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'provider'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('provider')}
            type="button"
          >
            {t('settings.providerTab')}
          </button>
        </div>

        {activeTab === 'chat' ? (
          <div className="mt-6 grid gap-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.model')}
              </span>
              <Input
                placeholder={t('settings.modelPlaceholder')}
                value={settings.model}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    model: event.target.value,
                  }))
                }
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.systemPrompt')}
              </span>
              <Textarea
                className="min-h-[160px] rounded-xl border border-[var(--line)] bg-white px-4 py-3"
                value={settings.systemPrompt}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    systemPrompt: event.target.value,
                  }))
                }
              />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {t('settings.temperature')}
                </span>
                <Input
                  min="0"
                  max="2"
                  step="0.1"
                  type="number"
                  value={settings.temperature ?? ''}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      temperature:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {t('settings.maxTokens')}
                </span>
                <Input
                  min="0"
                  step="1"
                  type="number"
                  value={settings.maxTokens ?? ''}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      maxTokens:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-5 py-4">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {t('settings.currentSource')}
              </p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {describeProviderSource(providerState, activePreset, t)}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                      {t('settings.savedPresets')}
                    </h3>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {t('settings.onePresetActive')}
                    </p>
                  </div>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
                    onClick={onStartNewProvider}
                    title={t('settings.createProviderPreset')}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {isLoadingProviders ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 py-4 text-sm text-[var(--muted-foreground)]">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {t('settings.loadingPresets')}
                  </div>
                ) : providerState && providerState.presets.length > 0 ? (
                  <div className="space-y-3">
                    {providerState.presets.map((preset) => (
                      <button
                        key={preset.id}
                        className={cn(
                          'w-full rounded-2xl border px-4 py-4 text-left transition',
                          editingProviderId === preset.id
                            ? 'border-[var(--brand)]/40 bg-[var(--brand)]/[0.04]'
                            : 'border-[var(--line)] bg-white hover:bg-black/[0.02]',
                        )}
                        onClick={() => onEditProvider(preset)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                              {preset.name}
                            </p>
                            <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                              {preset.defaultModel}
                            </p>
                          </div>
                          {preset.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)]/[0.08] px-2.5 py-1 text-xs font-medium text-[var(--brand-strong)]">
                              <Check className="h-3.5 w-3.5" />
                              {t('settings.active')}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 truncate text-xs text-[var(--muted-foreground)]">
                          {preset.baseURL}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {t('settings.key')}: {preset.apiKeyHint}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={preset.isActive || isSavingProvider}
                            onClick={(event) => {
                              event.stopPropagation()
                              onActivateProvider(preset.id)
                            }}
                            type="button"
                          >
                            {t('settings.setActive')}
                          </button>
                          <button
                            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSavingProvider}
                            onClick={(event) => {
                              event.stopPropagation()
                              onDeleteProvider(preset)
                            }}
                            type="button"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--app-bg)] px-4 py-5 text-sm text-[var(--muted-foreground)]">
                    {t('settings.noSavedPresets')}
                  </div>
                )}

                <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {t('settings.envFallback')}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {providerState?.fallback.available
                          ? t('settings.envReady')
                          : t('settings.envNotConfigured')}
                      </p>
                    </div>
                    <Server className="mt-0.5 h-4 w-4 text-[var(--muted-foreground)]" />
                  </div>
                  <p className="mt-3 truncate text-xs text-[var(--muted-foreground)]">
                    {providerState?.fallback.baseURL || t('settings.noFallbackBaseUrl')}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {providerState?.fallback.defaultModel || t('settings.noFallbackModel')}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-[var(--line)] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--foreground)]">
                      {editingProviderId ? t('settings.editPreset') : t('settings.newPreset')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {t('settings.presetDescription')}
                    </p>
                  </div>
                  {editingProviderId ? (
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition hover:bg-black/[0.04] hover:text-[var(--foreground)]"
                      onClick={onResetProvider}
                      type="button"
                    >
                      {t('settings.newPreset')}
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.presetName')}
                    </span>
                    <Input
                      placeholder={t('settings.presetNamePlaceholder')}
                      value={providerForm.name}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.defaultModelLabel')}
                    </span>
                    <Input
                      placeholder="gpt-4.1-mini"
                      value={providerForm.defaultModel}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          defaultModel: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.baseUrl')}
                    </span>
                    <Input
                      placeholder={OPENAI_COMPATIBLE_DEFAULT_BASE_URL}
                      value={providerForm.baseURL}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          baseURL: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {t('settings.apiKey')}
                    </span>
                    <Input
                      placeholder={
                        editingProviderId
                          ? t('settings.apiKeyPlaceholderEdit')
                          : t('settings.apiKeyPlaceholderNew')
                      }
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(event) =>
                        setProviderForm((previous) => ({
                          ...previous,
                          apiKey: event.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {editingProviderId
                        ? t('settings.apiKeyHelpEdit')
                        : t('settings.apiKeyHelpNew')}
                    </p>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {activeTab === 'chat' ? (
            <>
              <Button onClick={onReset} variant="ghost">
                {t('common.reset')}
              </Button>
              <Button onClick={onClose} variant="secondary">
                {t('common.close')}
              </Button>
              <Button disabled={isSaving} onClick={onSave}>
                {isSaving ? t('common.saving') : t('settings.saveSettings')}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onResetProvider} variant="ghost">
                {editingProviderId ? t('settings.newPreset') : t('settings.resetForm')}
              </Button>
              <Button onClick={onClose} variant="secondary">
                {t('common.close')}
              </Button>
              <Button
                disabled={isLoadingProviders || isSavingProvider}
                onClick={onSaveProvider}
              >
                {isSavingProvider
                  ? t('common.saving')
                  : editingProviderId
                    ? t('settings.savePreset')
                    : t('settings.createPreset')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  hasConversations,
  onContinueLast,
}: {
  hasConversations: boolean
  onContinueLast: () => void
}) {
  const { t } = useI18n()
  const hasLastConversation = Boolean(
    localStorage.getItem(LAST_CONVERSATION_STORAGE_KEY),
  )

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
      <div className="w-full max-w-xl space-y-4 text-center">
        <h2 className="font-['Lora',serif] text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
          {t('empty.title')}
        </h2>
        <p className="text-base leading-7 text-[var(--muted-foreground)]">
          {hasConversations
            ? t('empty.withConversations')
            : t('empty.withoutConversations')}
        </p>
        {hasConversations && hasLastConversation ? (
          <div className="pt-2">
            <Button onClick={onContinueLast} variant="secondary">
              {t('empty.continueLastConversation')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  canEdit,
  canRetry,
  canRegenerate,
  isEditing,
  onEdit,
  onRetry,
  onRegenerate,
}: {
  message: Message
  canEdit: boolean
  canRetry: boolean
  canRegenerate: boolean
  isEditing: boolean
  onEdit: () => void
  onRetry: () => void
  onRegenerate: () => void
}) {
  const { locale, t } = useI18n()
  const isUser = message.role === 'user'
  const isFailed = message.status === 'failed'
  const isCancelled = message.status === 'cancelled'

  if (isUser) {
    return (
      <article className="chat-fade-in flex justify-end">
        <div className="max-w-[85%] space-y-2 md:max-w-[560px]">
          <div className="rounded-2xl bg-[var(--user-bubble)] px-4 py-3 text-[var(--user-bubble-foreground)]">
            {message.attachments.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-3">
                {message.attachments.map((attachment) => (
                  <img
                    key={attachment.id}
                    alt={attachment.name}
                    className="w-full rounded-xl border border-black/10 object-cover"
                    src={attachment.url}
                  />
                ))}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-[15px] leading-7">{message.content}</p>
          </div>
          <div className="flex items-center justify-end gap-3 text-xs text-[var(--muted-foreground)]">
            <span>{formatMessageTimestamp(message.createdAt, locale)}</span>
            {isEditing ? <span>{t('message.editing')}</span> : null}
            {canEdit ? (
              <Button className="px-2 py-1 text-xs" onClick={onEdit} variant="ghost">
                {t('message.edit')}
              </Button>
            ) : null}
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="chat-fade-in">
      <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
        <span>{formatMessageTimestamp(message.createdAt, locale)}</span>
        {isFailed ? <span className="text-[var(--danger)]">{t('message.failed')}</span> : null}
        {isCancelled ? <span className="text-[var(--danger)]">{t('message.stopped')}</span> : null}
      </div>
      <div className="markdown mt-2 text-[var(--foreground)]">
        <ReactMarkdown
          components={{
            code(props) {
              const { children, className, ...rest } = props
              const code = String(children).replace(/\n$/, '')
              const isInline = !className

              if (isInline) {
                return (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                )
              }

              return <CodeBlock code={code} language={className} />
            },
          }}
          remarkPlugins={[remarkGfm]}
        >
          {message.content || t('message.thinking')}
        </ReactMarkdown>
      </div>

      {canRetry || canRegenerate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canRetry ? (
            <Button className="px-3 py-2" onClick={onRetry} variant="secondary">
              {t('message.retry')}
            </Button>
          ) : null}
          {canRegenerate ? (
            <Button className="px-3 py-2" onClick={onRegenerate} variant="secondary">
              {t('chat.regenerate')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function CodeBlock({
  code,
  language,
}: {
  code: string
  language?: string
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/6 bg-[#1e1e1c]">
      <div className="flex items-center justify-between border-b border-white/6 px-4 py-2 text-xs text-white/70">
        <span>{language?.replace('language-', '') || t('message.code')}</span>
        <Button className="px-2 py-1 text-xs" onClick={() => void handleCopy()} variant="ghost">
          {copied ? t('message.copied') : t('message.copy')}
        </Button>
      </div>
      <pre className="m-0 overflow-x-auto p-4">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function appendToStreamingMessage(messages: Message[], content: string) {
  const nextMessages = [...messages]
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const candidate = nextMessages[index]
    if (candidate.role === 'assistant' && candidate.status === 'streaming') {
      nextMessages[index] = {
        ...candidate,
        content: candidate.content + content,
      }
      return nextMessages
    }
  }
  return messages
}

function upsertMessage(messages: Message[], message: Message, placeholderId: number) {
  let replaced = false
  const nextMessages = messages.map((item) => {
    if (item.id === placeholderId || item.id === message.id) {
      replaced = true
      return message
    }
    return item
  })

  return replaced ? nextMessages : [...nextMessages, message]
}

function isSameMessage(
  left: Message,
  right: Message | undefined,
  placeholderId: number,
) {
  if (!right) {
    return left.id === placeholderId
  }
  return left.id === right.id || left.id === placeholderId
}

function dedupeConversations(conversations: Conversation[]) {
  const unique = new Map<number, Conversation>()
  for (const conversation of conversations) {
    unique.set(conversation.id, conversation)
  }
  return Array.from(unique.values())
}

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1
    }
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

function findLatestMessageByRole(messages: Message[], role: Message['role']) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index]
    }
  }
  return null
}

function cleanupComposerImages(images: ComposerImage[]) {
  for (const image of images) {
    if (image.revokeOnCleanup) {
      URL.revokeObjectURL(image.previewUrl)
    }
  }
}

function dedupeComposerImages(images: ComposerImage[]) {
  const unique = new Map<string, ComposerImage>()
  for (const image of images) {
    unique.set(image.id, image)
  }
  return Array.from(unique.values())
}

function createComposerImagesFromAttachments(attachments: Attachment[]) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    previewUrl: attachment.url,
    sourceUrl: attachment.url,
    revokeOnCleanup: false,
  }))
}

async function buildAttachmentPayload(
  images: ComposerImage[],
  t: I18nContextValue['t'],
) {
  const payloads = await Promise.all(
    images.map(async (image) => ({
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      size: image.size,
      url: image.sourceUrl ?? (await readFileAsDataURL(image.file, t)),
    })),
  )

  return payloads
}

async function readFileAsDataURL(
  file: File | undefined,
  t: I18nContextValue['t'],
) {
  if (!file) {
    throw new Error(t('error.readSelectedImage'))
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error(t('error.readImageNamed', { name: file.name })))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function formatMessageTimestamp(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function buildConversationMarkdown(
  conversation: Conversation,
  messages: Message[],
  locale: string,
  t: I18nContextValue['t'],
) {
  const lines = [
    `# ${conversation.title}`,
    '',
    `${t('markdown.model')}: ${conversation.settings.model || t('chat.defaultModel')}`,
    `${t('markdown.updated')}: ${new Date(conversation.updatedAt).toLocaleString(locale)}`,
    '',
  ]

  for (const message of messages) {
    lines.push(
      `## ${message.role === 'user' ? t('markdown.user') : t('markdown.assistant')}`,
    )
    lines.push('')

    if (message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        lines.push(`![${attachment.name}](${attachment.url})`)
      }
      lines.push('')
    }

    if (message.content) {
      lines.push(message.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function createProviderForm(
  fallback?: ProviderState['fallback'],
  preset?: ProviderPreset | null,
): ProviderFormState {
  if (preset) {
    return {
      name: preset.name,
      baseURL: preset.baseURL,
      apiKey: '',
      defaultModel: preset.defaultModel,
    }
  }

  return {
    name: '',
    baseURL: fallback?.baseURL || OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
    apiKey: '',
    defaultModel: fallback?.defaultModel || '',
  }
}

function describeProviderSource(
  providerState: ProviderState | null,
  activePreset: ProviderPreset | null,
  t: I18nContextValue['t'],
) {
  if (!providerState) {
    return t('provider.loadingStatus')
  }

  if (providerState.currentSource === 'preset' && activePreset) {
    return t('provider.usingPreset', {
      name: activePreset.name,
      model: activePreset.defaultModel,
    })
  }

  if (providerState.currentSource === 'env') {
    return providerState.fallback.available
      ? t('provider.usingEnvModel', {
          model: providerState.fallback.defaultModel,
        })
      : t('provider.usingEnv')
  }

  return t('provider.notConfigured')
}

function readDesktopSidebarCollapsedPreference() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const rawValue = window.localStorage.getItem(
      DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
    )
    return rawValue ? JSON.parse(rawValue) === true : false
  } catch {
    return false
  }
}

function getConversationMonogram(title: string) {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) {
    return 'C'
  }

  return trimmedTitle[0]?.toUpperCase() ?? 'C'
}
