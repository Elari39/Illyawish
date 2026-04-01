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
  applyConversationFilters,
  applyConversationRemoval,
  applyConversationSync,
  getAvailableConversationFolders,
  getAvailableConversationTags,
  matchesConversationFilters,
  sortConversations,
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

export function useConversationList(options: UseConversationListOptions) {
  interface SyncConversationOptions {
    updateCountsForVisibilityChange?: boolean
    invalidateRequests?: boolean
  }

  const { activeConversationId, onError } = options

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
        preserveVisibleConversation?: Conversation | null
      } = {},
    ) => {
      if (options.invalidateRequests ?? true) {
        requestVersionRef.current += 1
      }

      const mutationResult = updater(stateRef.current.loadedConversations)

      let conversations = applyConversationFilters(mutationResult.conversations, {
        showArchived: stateRef.current.showArchived,
        search: stateRef.current.conversationSearch,
        selectedFolder: stateRef.current.selectedFolder,
        selectedTags: stateRef.current.selectedTags,
      })

      const preservedConversation = options.preserveVisibleConversation ?? null
      if (
        preservedConversation &&
        stateRef.current.conversationSearch.trim() !== '' &&
        mutationResult.conversations.some((conversation) => conversation.id === preservedConversation.id) &&
        !conversations.some((conversation) => conversation.id === preservedConversation.id) &&
        matchesConversationFilters(preservedConversation, {
          showArchived: stateRef.current.showArchived,
          search: '',
          selectedFolder: stateRef.current.selectedFolder,
          selectedTags: stateRef.current.selectedTags,
        })
      ) {
        conversations = sortConversations([preservedConversation, ...conversations])
      }

      dispatchWithStateRef({
        type: 'apply_mutation',
        result: {
          ...mutationResult,
          loadedConversations: mutationResult.conversations,
          conversations,
        },
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
              selectedFolder: stateRef.current.selectedFolder,
              selectedTags: stateRef.current.selectedTags,
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
          preserveVisibleConversation:
            stateRef.current.conversations.find((item) => item.id === conversation.id) ??
            null,
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
              selectedFolder: stateRef.current.selectedFolder,
              selectedTags: stateRef.current.selectedTags,
            },
            {
              countAsNew: matchesConversationFilters(conversation, {
                showArchived: stateRef.current.showArchived,
                search: deferredConversationSearch,
                selectedFolder: stateRef.current.selectedFolder,
                selectedTags: stateRef.current.selectedTags,
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
    availableFolders: getAvailableConversationFolders(
      state.loadedConversations.filter(
        (conversation) => conversation.isArchived === state.showArchived,
      ),
    ),
    availableTags: getAvailableConversationTags(
      state.loadedConversations.filter(
        (conversation) => conversation.isArchived === state.showArchived,
      ),
      state.selectedFolder,
    ),
    conversationTotal: state.conversationTotal,
    hasMoreConversations,
    conversationSearch: state.conversationSearch,
    deferredConversationSearch,
    showArchived: state.showArchived,
    selectedFolder: state.selectedFolder,
    selectedTags: state.selectedTags,
    selectionMode: state.selectionMode,
    selectedConversationIds: state.selectedConversationIds,
    isLoadingConversations: state.isLoadingConversations,
    isLoadingMoreConversations: state.isLoadingMoreConversations,
    setConversationSearch: (value: string) =>
      dispatchWithStateRef({ type: 'set_search', value }),
    setShowArchived: (value: boolean) =>
      dispatchWithStateRef({ type: 'set_show_archived', value }),
    setSelectedFolder: (value: string | null) =>
      dispatchWithStateRef({ type: 'set_selected_folder', value }),
    toggleSelectedTag: (value: string) =>
      dispatchWithStateRef({ type: 'toggle_selected_tag', value }),
    clearSelectedTags: () =>
      dispatchWithStateRef({ type: 'clear_selected_tags' }),
    setSelectionMode: (value: boolean) =>
      dispatchWithStateRef({ type: 'set_selection_mode', value }),
    toggleConversationSelection: (conversationId: Conversation['id']) =>
      dispatchWithStateRef({ type: 'toggle_conversation_selection', conversationId }),
    clearSelectedConversations: () =>
      dispatchWithStateRef({ type: 'clear_selected_conversations' }),
    setSkipAutoResume,
    insertCreatedConversation,
    loadConversations,
    syncConversationIntoList,
    removeConversationFromList,
  }
}
