import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { chatApi } from '../../../lib/api'
import type { Conversation } from '../../../types/chat'
import { CONVERSATION_PAGE_SIZE } from '../types'
import {
  getAvailableConversationFolders,
  getAvailableConversationTags,
  writeLastConversationId,
} from '../utils'
import { createConversationListOperations } from './conversation-list/operations'
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

  const {
    applyConversationPage,
    loadConversations,
    syncConversationIntoList,
    insertCreatedConversation,
    removeConversationFromList,
  } = useMemo(
    () =>
      createConversationListOperations({
        deferredConversationSearch,
        activeConversationIdRef,
        conversationQueryKeyRef,
        localOnlyConversationIdsRef,
        requestVersionRef,
        stateRef,
        dispatchWithStateRef,
        onError,
        t,
      }),
    [
      deferredConversationSearch,
      dispatchWithStateRef,
      onError,
      t,
    ],
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
