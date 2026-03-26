import { useDeferredValue, useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { chatApi } from '../../../lib/api'
import type { Conversation } from '../../../types/chat'
import { CONVERSATION_PAGE_SIZE } from '../types'
import {
  dedupeConversations,
  readLastConversationId,
  resolveRestorableConversationId,
  sortConversations,
  syncConversationList,
  writeLastConversationId,
} from '../utils'

interface UseConversationListOptions {
  activeConversationId: number | null
  onError: (message: string) => void
  navigateToConversation: (conversationId: number, replace?: boolean) => void
}

export function useConversationList({
  activeConversationId,
  onError,
  navigateToConversation,
}: UseConversationListOptions) {
  const { t } = useI18n()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationTotal, setConversationTotal] = useState(0)
  const [conversationSearch, setConversationSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false)

  const conversationsRef = useRef<Conversation[]>([])
  const isLoadingMoreConversationsRef = useRef(false)
  const conversationQueryKeyRef = useRef('')
  const skipAutoResumeRef = useRef(false)
  const deferredConversationSearch = useDeferredValue(conversationSearch.trim())
  const conversationQueryKey = [
    showArchived ? 'archived' : 'active',
    deferredConversationSearch.toLowerCase(),
  ].join(':')
  const restorableConversationId = resolveRestorableConversationId(
    conversations,
    readLastConversationId(),
    showArchived,
    deferredConversationSearch,
  )

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    isLoadingMoreConversationsRef.current = isLoadingMoreConversations
  }, [isLoadingMoreConversations])

  useEffect(() => {
    conversationQueryKeyRef.current = conversationQueryKey
  }, [conversationQueryKey])

  useEffect(() => {
    let cancelled = false
    const requestQueryKey = conversationQueryKey

    async function fetchConversations() {
      try {
        setIsLoadingConversations(true)

        const result = await chatApi.listConversationsPage({
          search: deferredConversationSearch || undefined,
          archived: showArchived,
          limit: CONVERSATION_PAGE_SIZE,
          offset: 0,
        })

        if (
          cancelled ||
          conversationQueryKeyRef.current !== requestQueryKey
        ) {
          return
        }

        applyConversationPage(result)
      } catch (error) {
        if (cancelled) {
          return
        }

        onError(
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
  }, [conversationQueryKey, deferredConversationSearch, onError, showArchived, t])

  useEffect(() => {
    if (!activeConversationId) {
      return
    }

    skipAutoResumeRef.current = false
    writeLastConversationId(activeConversationId)
  }, [activeConversationId])

  useEffect(() => {
    if (
      activeConversationId ||
      isLoadingConversations ||
      skipAutoResumeRef.current ||
      restorableConversationId == null
    ) {
      return
    }

    navigateToConversation(restorableConversationId, true)
  }, [
    activeConversationId,
    isLoadingConversations,
    navigateToConversation,
    restorableConversationId,
  ])

  function applyConversationPage(
    result: {
      conversations: Conversation[]
      total: number
    },
    append = false,
  ) {
    setConversations((previous) =>
      append
        ? sortConversations(
            dedupeConversations([...previous, ...result.conversations]),
          )
        : sortConversations(result.conversations),
    )
    setConversationTotal(result.total)
  }

  async function loadConversations(
    { append = false }: { append?: boolean } = {},
  ) {
    if (append && isLoadingMoreConversationsRef.current) {
      return
    }

    const requestQueryKey = conversationQueryKeyRef.current

    try {
      if (append) {
        isLoadingMoreConversationsRef.current = true
        setIsLoadingMoreConversations(true)
      } else {
        setIsLoadingConversations(true)
      }

      const result = await chatApi.listConversationsPage({
        search: deferredConversationSearch || undefined,
        archived: showArchived,
        limit: CONVERSATION_PAGE_SIZE,
        offset: append ? conversationsRef.current.length : 0,
      })

      if (conversationQueryKeyRef.current !== requestQueryKey) {
        return
      }

      applyConversationPage(result, append)
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : t('error.loadConversations'),
      )
    } finally {
      if (append) {
        isLoadingMoreConversationsRef.current = false
      }
      setIsLoadingConversations(false)
      setIsLoadingMoreConversations(false)
    }
  }

  function syncConversationIntoList(conversation: Conversation) {
    setConversations((previous) =>
      syncConversationList(
        previous,
        conversation,
        showArchived,
        deferredConversationSearch,
      ),
    )
  }

  function removeConversationFromList(conversationId: number) {
    setConversations((previous) =>
      previous.filter((conversation) => conversation.id !== conversationId),
    )
  }

  function setSkipAutoResume(value: boolean) {
    skipAutoResumeRef.current = value
  }

  return {
    conversations,
    conversationTotal,
    conversationSearch,
    deferredConversationSearch,
    showArchived,
    isLoadingConversations,
    isLoadingMoreConversations,
    restorableConversationId,
    setConversationSearch,
    setConversationTotal,
    setShowArchived,
    setSkipAutoResume,
    loadConversations,
    syncConversationIntoList,
    removeConversationFromList,
  }
}
