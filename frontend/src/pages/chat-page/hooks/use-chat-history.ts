import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { chatApi } from '../../../lib/api'
import {
  clearLastConversationId,
  isConversationNotFoundError,
  mergePreservedMessages,
  writeLastConversationId,
} from '../utils'
import { resolveConversationForList } from './chat-session-helpers'
import { resolveHistoryPagination } from './chat-history/helpers'
import { createChatHistoryOperations } from './chat-history/operations'
import type {
  ApplyConversationSnapshot,
  UseChatHistoryOptions,
} from './chat-history/types'

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
  skipNextConversationSyncRef,
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
}: UseChatHistoryOptions) {
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [nextBeforeMessageId, setNextBeforeMessageId] = useState<number | null>(
    null,
  )
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)
  const hasMoreMessagesRef = useRef(hasMoreMessages)
  const nextBeforeMessageIdRef = useRef(nextBeforeMessageId)
  const isLoadingOlderMessagesRef = useRef(isLoadingOlderMessages)

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
  hasMoreMessagesRef.current = hasMoreMessages
  nextBeforeMessageIdRef.current = nextBeforeMessageId
  isLoadingOlderMessagesRef.current = isLoadingOlderMessages

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
    skipNextConversationSyncRef.current = null
  }, [
    activeConversationId,
    clearEditingMessage,
    resetForNewChatSettings,
    skipNextConversationSyncRef,
    setChatError,
    setMessages,
  ])

  const applyConversationSnapshot = useCallback<ApplyConversationSnapshot>((
    response,
    replaceMessages,
    preserveMessages = [],
  ) => {
    syncConversationIntoListRef.current(
      resolveConversationForList(response.conversation),
      { updateCountsForVisibilityChange: false },
    )
    setPendingConversation(response.conversation)

    if (replaceMessages) {
      setMessages(
        preserveMessages.length > 0
          ? mergePreservedMessages(response.messages, preserveMessages)
          : response.messages,
      )
      setSettingsDraft(response.conversation.settings)
    }

    const pagination = resolveHistoryPagination(response)
    setHasMoreMessages(pagination.hasMoreMessages)
    setNextBeforeMessageId(pagination.nextBeforeMessageId)
    writeLastConversationId(response.conversation.id)
  }, [setMessages, setPendingConversation, setSettingsDraft])

  const {
    reconcileConversationState,
    loadOlderMessages,
    waitForConversationToSettle,
    resetHistoryState,
  } = useMemo(
    () =>
      createChatHistoryOperations({
        activeConversationId,
        activeConversationIdRef,
        activeGenerationRef,
        applyConversationSnapshot,
        skipNextConversationSyncRef,
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
        setChatError,
        hasMoreMessagesRef,
        nextBeforeMessageIdRef,
        isLoadingOlderMessagesRef,
        setHasMoreMessages,
        setNextBeforeMessageId,
        setIsLoadingOlderMessages,
        syncConversationIntoListRef,
        navigateHomeRef,
        setSkipAutoResumeRef,
        tRef,
      }),
    [
      activeConversationId,
      activeConversationIdRef,
      activeGenerationRef,
      applyConversationSnapshot,
      clearEditingMessage,
      hasMoreMessagesRef,
      isLoadingOlderMessagesRef,
      messageViewportRef,
      nextBeforeMessageIdRef,
      resetForNewChatSettings,
      setChatError,
      setConversationFolderDraft,
      setConversationTagsDraft,
      setIsLoadingMessages,
      setIsSending,
      setMessages,
      setPendingConversation,
      setSettingsDraft,
      skipNextConversationSyncRef,
    ],
  )

  useEffect(() => {
    if (
      !activeConversationId ||
      activeGenerationRef.current?.conversationId === activeConversationId
    ) {
      return
    }

    const targetConversationId = activeConversationId
    const shouldPreserveErrorDuringSync =
      skipNextConversationSyncRef.current === activeConversationId
    if (shouldPreserveErrorDuringSync) {
      skipNextConversationSyncRef.current = null
    }

    let cancelled = false

    async function syncMessages() {
      try {
        setIsLoadingMessages(true)
        if (!shouldPreserveErrorDuringSync) {
          setChatError(null)
        }

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
    skipNextConversationSyncRef,
  ])

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
