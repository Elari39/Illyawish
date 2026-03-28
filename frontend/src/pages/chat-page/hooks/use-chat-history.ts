import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import type { Conversation, ConversationMessagesResponse, Message } from '../../../types/chat'
import {
  clearLastConversationId,
  dedupeMessages,
  isConversationNotFoundError,
  writeLastConversationId,
} from '../utils'
import {
  resolveConversationForList,
  wait,
} from './chat-session-helpers'

const STOP_RECONCILE_ATTEMPTS = 12
const STOP_RECONCILE_DELAY_MS = 150
const MESSAGE_PAGE_SIZE = 50

interface UseChatHistoryOptions {
  activeConversationId: Conversation['id'] | null
  search: string
  showArchived: boolean
  setChatError: (value: string | null) => void
  syncConversationIntoList: (
    conversation: Conversation,
    options?: { updateCountsForVisibilityChange?: boolean },
  ) => void
  navigateHome: (replace?: boolean) => void
  setSkipAutoResume: (value: boolean) => void
  t: I18nContextValue['t']
  activeConversationIdRef: MutableRefObject<Conversation['id'] | null>
  activeGenerationRef: MutableRefObject<{ conversationId: Conversation['id'] } | null>
  messageViewportRef: MutableRefObject<HTMLDivElement | null>
  clearEditingMessage: () => void
  resetForNewChatSettings: () => void
  setConversationFolderDraft: (value: string) => void
  setConversationTagsDraft: (value: string) => void
  setPendingConversation: (conversation: Conversation | null) => void
  setSettingsDraft: (value: Conversation['settings']) => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setIsLoadingMessages: (value: boolean) => void
  setIsSending: (value: boolean) => void
  skipNextMessageAutoScroll: () => void
}

export function useChatHistory({
  activeConversationId,
  search,
  showArchived,
  setChatError,
  syncConversationIntoList,
  navigateHome,
  setSkipAutoResume,
  t,
  activeConversationIdRef,
  activeGenerationRef,
  messageViewportRef,
  clearEditingMessage,
  resetForNewChatSettings,
  setConversationFolderDraft,
  setConversationTagsDraft,
  setPendingConversation,
  setSettingsDraft,
  setMessages,
  setIsLoadingMessages,
  setIsSending,
  skipNextMessageAutoScroll,
}: UseChatHistoryOptions) {
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [nextBeforeMessageId, setNextBeforeMessageId] = useState<number | null>(
    null,
  )
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)

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

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId, activeConversationIdRef])

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
  }, [
    activeConversationId,
    clearEditingMessage,
    resetForNewChatSettings,
    setChatError,
    setMessages,
  ])

  const applyConversationSnapshot = useCallback((
    response: ConversationMessagesResponse,
    replaceMessages: boolean,
  ) => {
    syncConversationIntoListRef.current(
      resolveConversationForList(response.conversation),
      { updateCountsForVisibilityChange: false },
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
    activeConversationIdRef,
    activeGenerationRef,
    applyConversationSnapshot,
    setChatError,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setIsLoadingMessages,
    setMessages,
  ])

  async function reconcileConversationState(
    conversationId: Conversation['id'],
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
        resolveConversationForList(response.conversation),
        { updateCountsForVisibilityChange: false },
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

  async function waitForConversationToSettle(
    conversationId: Conversation['id'],
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

  function resetHistoryState() {
    setMessages([])
    setHasMoreMessages(false)
    setNextBeforeMessageId(null)
    setIsLoadingOlderMessages(false)
    setIsSending(false)
  }

  return {
    hasMoreMessages,
    nextBeforeMessageId,
    isLoadingOlderMessages,
    applyConversationSnapshot,
    reconcileConversationState,
    loadOlderMessages,
    waitForConversationToSettle,
    resetHistoryState,
  }
}
