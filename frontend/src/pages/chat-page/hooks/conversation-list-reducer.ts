import type { Conversation } from '../../../types/chat'
import {
  dedupeConversations,
  matchesConversationFilters,
  sortConversations,
} from '../utils'

export interface ConversationListState {
  conversations: Conversation[]
  conversationTotal: number
  loadedConversationCount: number
  conversationSearch: string
  showArchived: boolean
  isLoadingConversations: boolean
  isLoadingMoreConversations: boolean
}

export type ConversationListAction =
  | { type: 'set_search'; value: string }
  | { type: 'set_show_archived'; value: boolean }
  | { type: 'set_loading'; value: boolean }
  | { type: 'set_loading_more'; value: boolean }
  | {
      type: 'apply_page'
      result: {
        conversations: Conversation[]
        total: number
      }
      append: boolean
      loadedCount: number
      activeConversationId: Conversation['id'] | null
      search: string
      showArchived: boolean
    }
  | {
      type: 'apply_mutation'
      result: {
        conversations: Conversation[]
        totalDelta: number
        loadedDelta: number
      }
    }

export const initialConversationListState: ConversationListState = {
  conversations: [],
  conversationTotal: 0,
  loadedConversationCount: 0,
  conversationSearch: '',
  showArchived: false,
  isLoadingConversations: true,
  isLoadingMoreConversations: false,
}

export function conversationListReducer(
  state: ConversationListState,
  action: ConversationListAction,
): ConversationListState {
  switch (action.type) {
    case 'set_search':
      return {
        ...state,
        conversationSearch: action.value,
      }
    case 'set_show_archived':
      return {
        ...state,
        showArchived: action.value,
      }
    case 'set_loading':
      return {
        ...state,
        isLoadingConversations: action.value,
      }
    case 'set_loading_more':
      return {
        ...state,
        isLoadingMoreConversations: action.value,
      }
    case 'apply_page': {
      const { append, result, loadedCount, activeConversationId, search, showArchived } = action

      if (append) {
        return {
          ...state,
          conversations: sortConversations(
            dedupeConversations([...state.conversations, ...result.conversations]),
          ),
          conversationTotal: result.total,
          loadedConversationCount: loadedCount,
        }
      }

      const nextConversations = [...result.conversations]
      const activeConversation =
        state.conversations.find(
          (conversation) => conversation.id === activeConversationId,
        ) ?? null

      if (
        activeConversation &&
        !nextConversations.some(
          (conversation) => conversation.id === activeConversation.id,
        ) &&
        activeConversation.isArchived === showArchived &&
        matchesConversationFilters(activeConversation, {
          showArchived,
          search,
        })
      ) {
        nextConversations.unshift(activeConversation)
      }

      return {
        ...state,
        conversations: sortConversations(dedupeConversations(nextConversations)),
        conversationTotal: result.total,
        loadedConversationCount: loadedCount,
      }
    }
    case 'apply_mutation':
      return {
        ...state,
        conversations: action.result.conversations,
        conversationTotal: Math.max(
          state.conversationTotal + action.result.totalDelta,
          0,
        ),
        loadedConversationCount: Math.max(
          state.loadedConversationCount + action.result.loadedDelta,
          0,
        ),
      }
    default:
      return state
  }
}
