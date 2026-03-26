import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { chatApi } from '../../../lib/api'
import type { Conversation } from '../../../types/chat'
import { CONVERSATION_PAGE_SIZE } from '../types'
import {
  applyConversationRemoval,
  applyConversationSync,
  dedupeConversations,
  matchesConversationFilters,
  readLastConversationId,
  resolveRestorableConversationId,
  sortConversations,
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
  const [loadedConversationCount, setLoadedConversationCount] = useState(0)
  const [conversationSearch, setConversationSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false)

  const activeConversationIdRef = useRef<number | null>(activeConversationId)
  const conversationsRef = useRef<Conversation[]>([])
  const conversationTotalRef = useRef(0)
  const loadedConversationCountRef = useRef(0)
  const isLoadingMoreConversationsRef = useRef(false)
  const conversationQueryKeyRef = useRef('')
  const localOnlyConversationIdsRef = useRef(new Set<number>())
  const requestVersionRef = useRef(0)
  const skipAutoResumeRef = useRef(false)
  const deferredConversationSearch = useDeferredValue(conversationSearch.trim())
  const conversationQueryKey = [
    showArchived ? 'archived' : 'active',
    deferredConversationSearch.toLowerCase(),
  ].join(':')
  const hasMoreConversations = loadedConversationCount < conversationTotal
  const restorableConversationId = resolveRestorableConversationId(
    conversations,
    readLastConversationId(),
    showArchived,
    deferredConversationSearch,
  )

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    conversationTotalRef.current = conversationTotal
  }, [conversationTotal])

  useEffect(() => {
    loadedConversationCountRef.current = loadedConversationCount
  }, [loadedConversationCount])

  useEffect(() => {
    isLoadingMoreConversationsRef.current = isLoadingMoreConversations
  }, [isLoadingMoreConversations])

  useEffect(() => {
    conversationQueryKeyRef.current = conversationQueryKey
  }, [conversationQueryKey])

  const applyConversationPage = useCallback(
    (
      result: {
        conversations: Conversation[]
        total: number
      },
      {
        append = false,
        loadedCount = result.conversations.length,
      }: {
        append?: boolean
        loadedCount?: number
      } = {},
    ) => {
      setConversations((previous) => {
        for (const conversation of result.conversations) {
          localOnlyConversationIdsRef.current.delete(conversation.id)
        }

        if (append) {
          const nextConversations = sortConversations(
            dedupeConversations([...previous, ...result.conversations]),
          )
          conversationsRef.current = nextConversations
          return nextConversations
        }

        const nextConversations = [...result.conversations]
        const activeConversation =
          previous.find(
            (conversation) =>
              conversation.id === activeConversationIdRef.current,
          ) ?? null

        if (
          activeConversation &&
          !nextConversations.some(
            (conversation) => conversation.id === activeConversation.id,
        ) &&
          activeConversation.isArchived === showArchived &&
          matchesConversationFilters(activeConversation, {
            showArchived,
            search: deferredConversationSearch,
          })
        ) {
          nextConversations.unshift(activeConversation)
        }

        const sortedConversations = sortConversations(
          dedupeConversations(nextConversations),
        )
        conversationsRef.current = sortedConversations
        return sortedConversations
      })
      conversationTotalRef.current = result.total
      loadedConversationCountRef.current = loadedCount
      setConversationTotal(result.total)
      setLoadedConversationCount(loadedCount)
    },
    [deferredConversationSearch, showArchived],
  )

  const applyConversationMutation = useCallback((
    updater: (conversations: Conversation[]) => {
      conversations: Conversation[]
      totalDelta: number
      loadedDelta: number
    },
    options: {
      invalidateRequests?: boolean
    } = {},
  ) => {
    if (options.invalidateRequests ?? true) {
      requestVersionRef.current += 1
    }
    setConversations((previous) => {
      const result = updater(previous)
      conversationsRef.current = result.conversations

      if (result.totalDelta !== 0) {
        const nextTotal = Math.max(
          conversationTotalRef.current + result.totalDelta,
          0,
        )
        conversationTotalRef.current = nextTotal
        setConversationTotal(nextTotal)
      }

      if (result.loadedDelta !== 0) {
        const nextLoadedCount = Math.max(
          loadedConversationCountRef.current + result.loadedDelta,
          0,
        )
        loadedConversationCountRef.current = nextLoadedCount
        setLoadedConversationCount(nextLoadedCount)
      }

      return result.conversations
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const requestQueryKey = conversationQueryKey
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion

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
          requestVersionRef.current !== requestVersion ||
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
  }, [
    applyConversationPage,
    conversationQueryKey,
    deferredConversationSearch,
    onError,
    showArchived,
    t,
  ])

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

  const loadConversations = useCallback(async (
    { append = false }: { append?: boolean } = {},
  ) => {
    if (append && isLoadingMoreConversationsRef.current) {
      return
    }

    const requestQueryKey = conversationQueryKeyRef.current
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion

    try {
      if (append) {
        isLoadingMoreConversationsRef.current = true
        setIsLoadingMoreConversations(true)
      } else {
        setIsLoadingConversations(true)
      }
      const offset = append ? loadedConversationCountRef.current : 0

      const result = await chatApi.listConversationsPage({
        search: deferredConversationSearch || undefined,
        archived: showArchived,
        limit: CONVERSATION_PAGE_SIZE,
        offset,
      })

      if (
        conversationQueryKeyRef.current !== requestQueryKey ||
        requestVersionRef.current !== requestVersion
      ) {
        return
      }

      applyConversationPage(result, {
        append,
        loadedCount: offset + result.conversations.length,
      })
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
  }, [
    applyConversationPage,
    deferredConversationSearch,
    onError,
    showArchived,
    t,
  ])

  const syncConversationIntoList = useCallback((conversation: Conversation) => {
    applyConversationMutation((previous) => {
      const result = applyConversationSync(
        previous,
        conversation,
        {
          showArchived,
          search: deferredConversationSearch,
        },
      )

      if (!localOnlyConversationIdsRef.current.has(conversation.id)) {
        return result
      }

      if (!result.conversations.some((item) => item.id === conversation.id)) {
        localOnlyConversationIdsRef.current.delete(conversation.id)
      }

      return {
        ...result,
        loadedDelta: 0,
      }
    }, {
      invalidateRequests: false,
    })
  }, [applyConversationMutation, deferredConversationSearch, showArchived])

  const insertCreatedConversation = useCallback((conversation: Conversation) => {
    applyConversationMutation((previous) => {
      const result = applyConversationSync(
        previous,
        conversation,
        {
          showArchived,
          search: deferredConversationSearch,
        },
        {
          countAsNew: matchesConversationFilters(conversation, {
            showArchived,
            search: deferredConversationSearch,
          }),
        },
      )

      if (result.conversations.some((item) => item.id === conversation.id)) {
        localOnlyConversationIdsRef.current.add(conversation.id)
      }

      return result
    }, {
      invalidateRequests: false,
    })
  }, [applyConversationMutation, deferredConversationSearch, showArchived])

  const removeConversationFromList = useCallback((conversationId: number) => {
    applyConversationMutation((previous) => {
      const result = applyConversationRemoval(previous, conversationId)

      if (!localOnlyConversationIdsRef.current.has(conversationId)) {
        return result
      }

      localOnlyConversationIdsRef.current.delete(conversationId)
      return {
        ...result,
        loadedDelta: 0,
      }
    })
  }, [applyConversationMutation])

  const setSkipAutoResume = useCallback((value: boolean) => {
    skipAutoResumeRef.current = value
  }, [])

  return {
    conversations,
    conversationTotal,
    hasMoreConversations,
    conversationSearch,
    deferredConversationSearch,
    showArchived,
    isLoadingConversations,
    isLoadingMoreConversations,
    restorableConversationId,
    setConversationSearch,
    setShowArchived,
    setSkipAutoResume,
    insertCreatedConversation,
    loadConversations,
    syncConversationIntoList,
    removeConversationFromList,
  }
}
