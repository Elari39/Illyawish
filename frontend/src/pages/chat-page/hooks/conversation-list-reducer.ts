import type { Conversation } from '../../../types/chat'
import {
  deriveVisibleConversations,
  pruneSelectedConversationIds,
  reconcileConversationFilterState,
  resolvePageConversations,
} from './conversation-list/reducer-helpers'

export interface ConversationListState {
  loadedConversations: Conversation[]
  conversations: Conversation[]
  conversationTotal: number
  loadedConversationCount: number
  conversationSearch: string
  showArchived: boolean
  selectedFolder: string | null
  selectedTags: string[]
  selectionMode: boolean
  selectedConversationIds: Conversation['id'][]
  isLoadingConversations: boolean
  isLoadingMoreConversations: boolean
}

export type ConversationListAction =
  | { type: 'set_search'; value: string }
  | { type: 'set_show_archived'; value: boolean }
  | { type: 'set_selected_folder'; value: string | null }
  | { type: 'toggle_selected_tag'; value: string }
  | { type: 'clear_selected_tags' }
  | { type: 'set_selection_mode'; value: boolean }
  | { type: 'toggle_conversation_selection'; conversationId: Conversation['id'] }
  | { type: 'clear_selected_conversations' }
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
        loadedConversations: Conversation[]
        conversations: Conversation[]
        totalDelta: number
        loadedDelta: number
      }
    }

export const initialConversationListState: ConversationListState = {
  loadedConversations: [],
  conversations: [],
  conversationTotal: 0,
  loadedConversationCount: 0,
  conversationSearch: '',
  showArchived: false,
  selectedFolder: null,
  selectedTags: [],
  selectionMode: false,
  selectedConversationIds: [],
  isLoadingConversations: true,
  isLoadingMoreConversations: false,
}

export function conversationListReducer(
  state: ConversationListState,
  action: ConversationListAction,
): ConversationListState {
  switch (action.type) {
    case 'set_search': {
      const nextState = {
        ...state,
        conversationSearch: action.value,
      }
      const conversations = deriveVisibleConversations(state.loadedConversations, nextState)
      return {
        ...nextState,
        conversations,
        selectedConversationIds: pruneSelectedConversationIds(state.selectedConversationIds, conversations),
      }
    }
    case 'set_show_archived': {
      const nextState = {
        ...state,
        showArchived: action.value,
      }
      const { selectedTags } = reconcileConversationFilterState(
        state.loadedConversations,
        action.value,
        nextState.selectedFolder,
        nextState.selectedTags,
      )
      const withTagsState = {
        ...nextState,
        selectedTags,
      }
      const nextConversations = deriveVisibleConversations(state.loadedConversations, withTagsState)
      return {
        ...withTagsState,
        conversations: nextConversations,
        selectedConversationIds: pruneSelectedConversationIds(state.selectedConversationIds, nextConversations),
      }
    }
    case 'set_selected_folder': {
      const nextState = {
        ...state,
        selectedFolder: action.value,
      }
      const { selectedTags } = reconcileConversationFilterState(
        state.loadedConversations,
        state.showArchived,
        action.value,
        nextState.selectedTags,
      )
      const withTagsState = {
        ...nextState,
        selectedTags,
      }
      const conversations = deriveVisibleConversations(state.loadedConversations, withTagsState)
      return {
        ...withTagsState,
        conversations,
        selectedConversationIds: pruneSelectedConversationIds(state.selectedConversationIds, conversations),
      }
    }
    case 'toggle_selected_tag': {
      const normalizedValue = action.value.trim().toLowerCase()
      const selectedTags = state.selectedTags.some((tag) => tag.toLowerCase() === normalizedValue)
        ? state.selectedTags.filter((tag) => tag.toLowerCase() !== normalizedValue)
        : [...state.selectedTags, action.value.trim()].filter((tag) => tag !== '')
      const nextState = {
        ...state,
        selectedTags,
      }
      const conversations = deriveVisibleConversations(state.loadedConversations, nextState)
      return {
        ...nextState,
        conversations,
        selectedConversationIds: pruneSelectedConversationIds(state.selectedConversationIds, conversations),
      }
    }
    case 'clear_selected_tags': {
      const nextState = {
        ...state,
        selectedTags: [],
      }
      const conversations = deriveVisibleConversations(state.loadedConversations, nextState)
      return {
        ...nextState,
        conversations,
        selectedConversationIds: pruneSelectedConversationIds(state.selectedConversationIds, conversations),
      }
    }
    case 'set_selection_mode':
      return {
        ...state,
        selectionMode: action.value,
        selectedConversationIds: action.value ? state.selectedConversationIds : [],
      }
    case 'toggle_conversation_selection':
      if (!state.selectionMode) {
        return state
      }
      return {
        ...state,
        selectedConversationIds: state.selectedConversationIds.includes(action.conversationId)
          ? state.selectedConversationIds.filter((conversationId) => conversationId !== action.conversationId)
          : [...state.selectedConversationIds, action.conversationId],
      }
    case 'clear_selected_conversations':
      return {
        ...state,
        selectedConversationIds: [],
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
        const loadedConversations = resolvePageConversations({
          activeConversation: null,
          activeConversationId,
          append: true,
          conversations: [
            ...state.loadedConversations,
            ...result.conversations,
          ],
          search,
          showArchived,
        })
        const conversations = deriveVisibleConversations(loadedConversations, state)
        return {
          ...state,
          loadedConversations,
          conversations,
          conversationTotal: result.total,
          loadedConversationCount: loadedCount,
          selectedConversationIds: pruneSelectedConversationIds(state.selectedConversationIds, conversations),
        }
      }

      const nextConversations = [...result.conversations]
      const activeConversation =
        state.loadedConversations.find(
          (conversation) => conversation.id === activeConversationId,
        ) ?? null

      const loadedConversations = resolvePageConversations({
        activeConversation,
        activeConversationId,
        append: false,
        conversations: nextConversations,
        search,
        showArchived,
      })
      const { selectedFolder, selectedTags } =
        reconcileConversationFilterState(
          loadedConversations,
          showArchived,
          state.selectedFolder,
          state.selectedTags,
        )
      const nextState = {
        ...state,
        loadedConversations,
        selectedFolder,
        selectedTags,
      }
      const conversations = deriveVisibleConversations(loadedConversations, nextState)

      return {
        ...nextState,
        conversations,
        conversationTotal: result.total,
        loadedConversationCount: loadedCount,
        selectedConversationIds: pruneSelectedConversationIds(state.selectedConversationIds, conversations),
      }
    }
    case 'apply_mutation':
      return {
        ...state,
        loadedConversations: action.result.loadedConversations,
        conversations: action.result.conversations,
        conversationTotal: Math.max(
          state.conversationTotal + action.result.totalDelta,
          0,
        ),
        loadedConversationCount: Math.max(
          state.loadedConversationCount + action.result.loadedDelta,
          0,
        ),
        selectedConversationIds: pruneSelectedConversationIds(
          state.selectedConversationIds,
          action.result.conversations,
        ),
      }
    default:
      return state
  }
}
