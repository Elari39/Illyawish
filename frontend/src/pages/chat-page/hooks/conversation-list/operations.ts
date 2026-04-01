import { type MutableRefObject } from 'react'

import type { I18nContextValue } from '../../../../i18n/context'
import { chatApi } from '../../../../lib/api'
import type { Conversation } from '../../../../types/chat'
import { CONVERSATION_PAGE_SIZE } from '../../types'
import {
  applyConversationFilters,
  applyConversationRemoval,
  applyConversationSync,
  matchesConversationFilters,
  sortConversations,
} from '../../utils'
import type {
  ConversationListAction,
  ConversationListState,
} from '../conversation-list-reducer'

interface SyncConversationOptions {
  updateCountsForVisibilityChange?: boolean
  invalidateRequests?: boolean
}

interface ApplyConversationPageOptions {
  append?: boolean
  loadedCount?: number
}

interface CreateConversationListOperationsOptions {
  deferredConversationSearch: string
  activeConversationIdRef: MutableRefObject<Conversation['id'] | null>
  conversationQueryKeyRef: MutableRefObject<string>
  localOnlyConversationIdsRef: MutableRefObject<Set<Conversation['id']>>
  requestVersionRef: MutableRefObject<number>
  stateRef: MutableRefObject<ConversationListState>
  dispatchWithStateRef: (action: ConversationListAction) => void
  onError: (message: string) => void
  t: I18nContextValue['t']
}

export function createConversationListOperations({
  deferredConversationSearch,
  activeConversationIdRef,
  conversationQueryKeyRef,
  localOnlyConversationIdsRef,
  requestVersionRef,
  stateRef,
  dispatchWithStateRef,
  onError,
  t,
}: CreateConversationListOperationsOptions) {
  function applyConversationPage(
    result: {
      conversations: Conversation[]
      total: number
    },
    {
      append = false,
      loadedCount = result.conversations.length,
    }: ApplyConversationPageOptions = {},
  ) {
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
  }

  function applyConversationMutation(
    updater: (conversations: Conversation[]) => {
      conversations: Conversation[]
      totalDelta: number
      loadedDelta: number
    },
    options: {
      invalidateRequests?: boolean
      preserveVisibleConversation?: Conversation | null
    } = {},
  ) {
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
      mutationResult.conversations.some(
        (conversation) => conversation.id === preservedConversation.id,
      ) &&
      !conversations.some(
        (conversation) => conversation.id === preservedConversation.id,
      ) &&
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
  }

  async function loadConversations({ append = false }: { append?: boolean } = {}) {
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
        error instanceof Error ? error.message : t('error.loadConversations'),
      )
    } finally {
      if (append) {
        dispatchWithStateRef({ type: 'set_loading_more', value: false })
      }
      dispatchWithStateRef({ type: 'set_loading', value: false })
    }
  }

  function syncConversationIntoList(
    conversation: Conversation,
    options: SyncConversationOptions = {},
  ) {
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
          stateRef.current.conversations.find(
            (item) => item.id === conversation.id,
          ) ?? null,
      },
    )
  }

  function insertCreatedConversation(conversation: Conversation) {
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
  }

  function removeConversationFromList(conversationId: Conversation['id']) {
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
  }

  return {
    applyConversationPage,
    loadConversations,
    syncConversationIntoList,
    insertCreatedConversation,
    removeConversationFromList,
  }
}
