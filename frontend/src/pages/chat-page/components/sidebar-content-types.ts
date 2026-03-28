import type { Conversation } from '../../../types/chat'

export interface SidebarContentProps {
  collapsed: boolean
  variant: 'desktop' | 'mobile'
  interactionDisabled?: boolean
  currentConversationId: Conversation['id'] | null
  conversations: Conversation[]
  hasMoreConversations: boolean
  searchValue: string
  showArchived: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onSearchChange: (value: string) => void
  onToggleArchived: (value: boolean) => void
  onLoadMore: () => void
  onSelectConversation: (conversationId: Conversation['id']) => void
  onRenameConversation: (conversation: Conversation) => void
  onTogglePinned: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: Conversation['id']) => void
  onCreateChat: () => void
  username: string
  onLogout: () => void
}
