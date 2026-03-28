import type { Conversation } from '../../../types/chat'
import {
  applyConversationFilters,
  dedupeConversations,
  getAvailableConversationTags,
  matchesConversationFilters,
  sortConversations,
  SIDEBAR_UNFILED_FOLDER_KEY,
} from '../utils'

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

function pruneSelectedConversationIds(
  selectedConversationIds: Conversation['id'][],
  conversations: Conversation[],
) {
  const visibleIds = new Set(conversations.map((conversation) => conversation.id))
  return selectedConversationIds.filter((conversationId) => visibleIds.has(conversationId))
}

function deriveVisibleConversations(
  loadedConversations: Conversation[],
  state: Pick<ConversationListState, 'showArchived' | 'conversationSearch' | 'selectedFolder' | 'selectedTags'>,
) {
  return applyConversationFilters(loadedConversations, {
    showArchived: state.showArchived,
    search: state.conversationSearch,
    selectedFolder: state.selectedFolder,
    selectedTags: state.selectedTags,
  })
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
      const availableTags = getAvailableConversationTags(
        state.loadedConversations.filter((conversation) => conversation.isArchived === action.value),
        nextState.selectedFolder,
      )
      const selectedTags = nextState.selectedTags.filter((tag) =>
        availableTags.some((value) => value.toLowerCase() === tag.toLowerCase()),
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
      const availableTags = getAvailableConversationTags(
        state.loadedConversations.filter((conversation) => conversation.isArchived === state.showArchived),
        action.value,
      )
      const selectedTags = nextState.selectedTags.filter((tag) =>
        availableTags.some((value) => value.toLowerCase() === tag.toLowerCase()),
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
        const loadedConversations = sortConversations(
          dedupeConversations([...state.loadedConversations, ...result.conversations]),
        )
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

      const loadedConversations = sortConversations(dedupeConversations(nextConversations))
      const availableTags = getAvailableConversationTags(
        loadedConversations.filter((conversation) => conversation.isArchived === showArchived),
        state.selectedFolder,
      )
      const selectedFolder =
        state.selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY ||
        state.selectedFolder == null ||
        loadedConversations.some((conversation) => conversation.folder.trim() === state.selectedFolder) ||
        (state.selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY &&
          loadedConversations.some((conversation) => conversation.folder.trim() === ''))
          ? state.selectedFolder
          : null
      const selectedTags = state.selectedTags.filter((tag) =>
        availableTags.some((value) => value.toLowerCase() === tag.toLowerCase()),
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
