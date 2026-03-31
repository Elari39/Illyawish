import type { Conversation } from '../../../types/chat'

export interface SidebarContentProps {
  collapsed: boolean
  variant: 'desktop' | 'mobile'
  desktopSidebarExpanded?: boolean
  interactionDisabled?: boolean
  actionDisabled?: boolean
  conversationNavigationDisabled?: boolean
  desktopSidebarToggleDisabled?: boolean
  currentConversationId: Conversation['id'] | null
  conversations: Conversation[]
  hasMoreConversations: boolean
  searchValue: string
  showArchived: boolean
  availableFolders?: string[]
  availableTags?: string[]
  selectedFolder?: string | null
  selectedTags?: string[]
  selectionMode?: boolean
  selectedConversationIds?: Conversation['id'][]
  isLoading: boolean
  isLoadingMore: boolean
  onSearchChange: (value: string) => void
  onToggleArchived: (value: boolean) => void
  onSelectFolder?: (value: string | null) => void
  onToggleTag?: (value: string) => void
  onSetSelectionMode?: (value: boolean) => void
  onToggleConversationSelection?: (conversationId: Conversation['id']) => void
  onMoveConversationToFolder?: (conversation: Conversation) => void
  onAddConversationTags?: (conversation: Conversation) => void
  onRemoveConversationTags?: (conversation: Conversation) => void
  onBulkMoveToFolder?: () => void
  onBulkAddTags?: () => void
  onBulkRemoveTags?: () => void
  onLoadMore: () => void
  onSelectConversation: (conversationId: Conversation['id']) => void
  onRenameConversation: (conversation: Conversation) => void
  onTogglePinned: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: Conversation['id']) => void
  onToggleDesktopSidebar?: () => void
  onCreateChat: () => void
  username: string
  onLogout: () => void
}
