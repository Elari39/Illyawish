import {
  useCallback,
  useDeferredValue,
  useEffect,
  useReducer,
  useRef,
} from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { chatApi } from '../../../lib/api'
import type { Conversation } from '../../../types/chat'
import { CONVERSATION_PAGE_SIZE } from '../types'
import {
  applyConversationRemoval,
  applyConversationSync,
  matchesConversationFilters,
  readLastConversationId,
  resolveRestorableConversationId,
  writeLastConversationId,
} from '../utils'
import {
  conversationListReducer,
  initialConversationListState,
  type ConversationListAction,
  type ConversationListState,
} from './conversation-list-reducer'

interface UseConversationListOptions {
  activeConversationId: Conversation['id'] | null
  onError: (message: string) => void
  navigateToConversation: (conversationId: Conversation['id'], replace?: boolean) => void
}

export function useConversationList({
  activeConversationId,
  onError,
  navigateToConversation,
}: UseConversationListOptions) {
  interface SyncConversationOptions {
    updateCountsForVisibilityChange?: boolean
    invalidateRequests?: boolean
  }

  const { t } = useI18n()
  const [state, dispatch] = useReducer(
    conversationListReducer,
    initialConversationListState,
  )
  const stateRef = useRef<ConversationListState>(state)
  const activeConversationIdRef = useRef<Conversation['id'] | null>(activeConversationId)
  const conversationQueryKeyRef = useRef('')
  const localOnlyConversationIdsRef = useRef(new Set<Conversation['id']>())
  const requestVersionRef = useRef(0)
  const skipAutoResumeRef = useRef(false)

  const deferredConversationSearch = useDeferredValue(
    state.conversationSearch.trim(),
  )
  const conversationQueryKey = [
    state.showArchived ? 'archived' : 'active',
    deferredConversationSearch.toLowerCase(),
  ].join(':')
  const hasMoreConversations =
    state.loadedConversationCount < state.conversationTotal
  const restorableConversationId = resolveRestorableConversationId(
    state.conversations,
    readLastConversationId(),
    state.showArchived,
    deferredConversationSearch,
  )

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    conversationQueryKeyRef.current = conversationQueryKey
  }, [conversationQueryKey])

  const dispatchWithStateRef = useCallback((action: ConversationListAction) => {
    stateRef.current = conversationListReducer(stateRef.current, action)
    dispatch(action)
  }, [])

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
      for (const conversation of result.conversations) {
        localOnlyConversationIdsRef.current.delete(conversation.id)
      }

      dispatchWithStateRef({
        type: 'apply_page',
        result,
        append,
        loadedCount,
        activeConversationId: activeConversationIdRef.current,
        search: deferredConversationSearch,
        showArchived: stateRef.current.showArchived,
      })
    },
    [deferredConversationSearch, dispatchWithStateRef],
  )

  const applyConversationMutation = useCallback(
    (
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

      dispatchWithStateRef({
        type: 'apply_mutation',
        result: updater(stateRef.current.conversations),
      })
    },
    [dispatchWithStateRef],
  )

  useEffect(() => {
    let cancelled = false
    const requestQueryKey = conversationQueryKey
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion

    async function fetchConversations() {
      try {
        dispatchWithStateRef({ type: 'set_loading', value: true })

        const result = await chatApi.listConversationsPage({
          search: deferredConversationSearch || undefined,
          archived: state.showArchived,
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
          dispatchWithStateRef({ type: 'set_loading', value: false })
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
    state.showArchived,
    t,
    dispatchWithStateRef,
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
      state.isLoadingConversations ||
      skipAutoResumeRef.current ||
      restorableConversationId == null
    ) {
      return
    }

    navigateToConversation(restorableConversationId, true)
  }, [
    activeConversationId,
    navigateToConversation,
    restorableConversationId,
    state.isLoadingConversations,
  ])

  const loadConversations = useCallback(
    async ({ append = false }: { append?: boolean } = {}) => {
      if (append && stateRef.current.isLoadingMoreConversations) {
        return
      }

      const requestQueryKey = conversationQueryKeyRef.current
      const requestVersion = requestVersionRef.current + 1
      requestVersionRef.current = requestVersion

      try {
        if (append) {
          dispatchWithStateRef({ type: 'set_loading_more', value: true })
        } else {
          dispatchWithStateRef({ type: 'set_loading', value: true })
        }

        const offset = append ? stateRef.current.loadedConversationCount : 0
        const result = await chatApi.listConversationsPage({
          search: deferredConversationSearch || undefined,
          archived: stateRef.current.showArchived,
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
          dispatchWithStateRef({ type: 'set_loading_more', value: false })
        }
        dispatchWithStateRef({ type: 'set_loading', value: false })
      }
    },
    [applyConversationPage, deferredConversationSearch, onError, t, dispatchWithStateRef],
  )

  const syncConversationIntoList = useCallback(
    (
      conversation: Conversation,
      options: SyncConversationOptions = {},
    ) => {
      applyConversationMutation(
        (previous) => {
          const wasVisible = previous.some((item) => item.id === conversation.id)
          const result = applyConversationSync(
            previous,
            conversation,
            {
              showArchived: stateRef.current.showArchived,
              search: deferredConversationSearch,
            },
            {
              updateCountsForVisibilityChange:
                options.updateCountsForVisibilityChange ?? true,
            },
          )
          const isVisible = result.conversations.some(
            (item) => item.id === conversation.id,
          )
          const countsShouldTrackVisibilityChange =
            !wasVisible &&
            isVisible &&
            (options.updateCountsForVisibilityChange ?? true)

          if (!localOnlyConversationIdsRef.current.has(conversation.id)) {
            if (!countsShouldTrackVisibilityChange) {
              return result
            }

            if (conversation.id === activeConversationIdRef.current) {
              return {
                ...result,
                totalDelta: 0,
                loadedDelta: 0,
              }
            }

            if (
              stateRef.current.loadedConversationCount <
              stateRef.current.conversationTotal
            ) {
              return {
                ...result,
                totalDelta: 0,
                loadedDelta: 1,
              }
            }

            return result
          }

          if (!result.conversations.some((item) => item.id === conversation.id)) {
            localOnlyConversationIdsRef.current.delete(conversation.id)
          }

          return {
            ...result,
            loadedDelta: 0,
          }
        },
        {
          invalidateRequests: options.invalidateRequests ?? true,
        },
      )
    },
    [applyConversationMutation, deferredConversationSearch],
  )

  const insertCreatedConversation = useCallback(
    (conversation: Conversation) => {
      applyConversationMutation(
        (previous) => {
          const result = applyConversationSync(
            previous,
            conversation,
            {
              showArchived: stateRef.current.showArchived,
              search: deferredConversationSearch,
            },
            {
              countAsNew: matchesConversationFilters(conversation, {
                showArchived: stateRef.current.showArchived,
                search: deferredConversationSearch,
              }),
            },
          )

          if (result.conversations.some((item) => item.id === conversation.id)) {
            localOnlyConversationIdsRef.current.add(conversation.id)
          }

          return result
        },
        {
          invalidateRequests: false,
        },
      )
    },
    [applyConversationMutation, deferredConversationSearch],
  )

  const removeConversationFromList = useCallback(
    (conversationId: Conversation['id']) => {
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
    },
    [applyConversationMutation],
  )

  const setSkipAutoResume = useCallback((value: boolean) => {
    skipAutoResumeRef.current = value
  }, [])

  return {
    conversations: state.conversations,
    conversationTotal: state.conversationTotal,
    hasMoreConversations,
    conversationSearch: state.conversationSearch,
    deferredConversationSearch,
    showArchived: state.showArchived,
    isLoadingConversations: state.isLoadingConversations,
    isLoadingMoreConversations: state.isLoadingMoreConversations,
    restorableConversationId,
    setConversationSearch: (value: string) =>
      dispatchWithStateRef({ type: 'set_search', value }),
    setShowArchived: (value: boolean) =>
      dispatchWithStateRef({ type: 'set_show_archived', value }),
    setSkipAutoResume,
    insertCreatedConversation,
    loadConversations,
    syncConversationIntoList,
    removeConversationFromList,
  }
}
