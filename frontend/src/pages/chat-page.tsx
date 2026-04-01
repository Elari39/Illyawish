import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { useI18n } from '../i18n/use-i18n'
import { ChatContextBar } from './chat-page/components/chat-context-bar'
import { ChatOverlays } from './chat-page/components/chat-overlays'
import { ChatSidebarLayout } from './chat-page/components/chat-sidebar-layout'
import { ChatToolMenuTrigger } from './chat-page/components/chat-tool-menu-trigger'
import { ChatWorkspace } from './chat-page/components/chat-workspace'
import {
  buildChatOverlaysProps,
  buildChatPageViewModel,
  buildComposerProps,
  buildMessageListProps,
  buildSidebarProps,
  buildWorkspaceProps,
  createChatPageNavigation,
} from './chat-page/chat-page-composition'
import { useAgentWorkspace } from './chat-page/hooks/use-agent-workspace'
import { useChatErrorState } from './chat-page/hooks/use-chat-error-state'
import { useChatPageActions } from './chat-page/hooks/use-chat-page-actions'
import { useChatSession } from './chat-page/hooks/use-chat-session'
import { useConversationList } from './chat-page/hooks/use-conversation-list'
import { useProviderSettings } from './chat-page/hooks/use-provider-settings'
import { useChatUIState } from './chat-page/hooks/use-chat-ui-state'

export function ChatPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const activeConversationId = params.conversationId ?? null
  const { navigateToConversation, navigateHome } = createChatPageNavigation({
    navigate,
  })

  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isComposerExpanded, setIsComposerExpanded] = useState(false)
  const chatErrorState = useChatErrorState()
  const uiState = useChatUIState()

  const conversationList = useConversationList({
    activeConversationId,
    onError: chatErrorState.setChatError,
    navigateToConversation,
  })

  const currentConversation =
    conversationList.conversations.find((conversation) => conversation.id === activeConversationId) ??
    null

  const chatSession = useChatSession({
    activeConversationId,
    currentConversation,
    search: conversationList.deferredConversationSearch,
    showArchived: conversationList.showArchived,
    setChatError: chatErrorState.setChatError,
    showToast: uiState.showToast,
    insertCreatedConversation: conversationList.insertCreatedConversation,
    removeConversationFromList: conversationList.removeConversationFromList,
    syncConversationIntoList: conversationList.syncConversationIntoList,
    loadConversations: conversationList.loadConversations,
    navigateToConversation,
    navigateHome,
    setSkipAutoResume: conversationList.setSkipAutoResume,
    t,
    locale,
  })

  const providerSettings = useProviderSettings({
    isSettingsOpen: uiState.isSettingsOpen,
    setChatError: chatErrorState.setChatError,
    showToast: uiState.showToast,
  })
  const agentWorkspace = useAgentWorkspace({
    isSettingsOpen: uiState.isSettingsOpen,
    setChatError: chatErrorState.setChatError,
  })
  const interactionDisabled = chatSession.isSending
  const viewModel = buildChatPageViewModel({
    activeConversationId,
    currentConversation,
    chatSession,
    isComposerExpanded,
    t,
  })

  const actions = useChatPageActions({
    activeConversationId,
    contextBarSettings: viewModel.contextBarSettings,
    interactionDisabled,
    conversationList,
    chatSession,
    providerSettings,
    uiState,
    navigate,
    navigateHome,
    logout,
    setIsSavingSettings,
    setChatError: chatErrorState.setChatError,
    t,
  })

  const composerToolTrigger = (
    <ChatToolMenuTrigger
      knowledgeSpaceIds={viewModel.contextBarKnowledgeSpaceIds}
      knowledgeSpaces={agentWorkspace.knowledgeSpaces}
      isDisabled={interactionDisabled}
      onOpenKnowledgeSettings={() => actions.handleOpenSettings('knowledge')}
    />
  )

  const modelControl = (
    <ChatContextBar
      compact
      compactVariant="model"
      chatSettings={chatSession.chatSettingsDraft}
      settings={viewModel.contextBarSettings}
      providerState={providerSettings.providerState}
      knowledgeSpaceIds={viewModel.contextBarKnowledgeSpaceIds}
      knowledgeSpaces={agentWorkspace.knowledgeSpaces}
      isDisabled={interactionDisabled}
      onOpenKnowledgeSettings={() => actions.handleOpenSettings('knowledge')}
      onProviderModelChange={(value) => void actions.handleProviderModelChange(value)}
      onSetAsDefault={() => void actions.handleSetDefaultProviderModel()}
    />
  )

  const sidebarProps = buildSidebarProps({
    activeConversationId,
    interactionDisabled,
    conversationList,
    uiState,
    actions,
    navigateToConversation,
    user,
  })
  const messageListProps = buildMessageListProps({
    activeConversationId,
    displayConversation: viewModel.displayConversation,
    chatSession,
    uiState,
  })
  const composerProps = buildComposerProps({
    activeConversationId,
    chatSession,
  })
  const workspaceProps = buildWorkspaceProps({
    user,
    t,
    uiState,
    chatErrorState,
    actions,
    navigateToAdmin: () => navigate('/admin'),
    setIsComposerExpanded,
    viewModel,
    messageListProps,
    composerProps,
    composerToolTrigger,
    modelControl,
  })
  const overlayProps = buildChatOverlaysProps({
    displayConversation: viewModel.displayConversation,
    chatSession,
    conversationList,
    providerSettings,
    agentWorkspace,
    uiState,
    actions,
    isSavingSettings,
  })

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--foreground)]">
      <ChatSidebarLayout
        isMobileOpen={uiState.sidebarOpen}
        onCloseMobile={() => uiState.setSidebarOpen(false)}
        isDesktopCollapsed={uiState.isDesktopSidebarCollapsed}
        onToggleDesktopSidebar={() =>
          uiState.setIsDesktopSidebarCollapsed((previous) => !previous)
        }
        {...sidebarProps}
      />

      <ChatWorkspace
        {...workspaceProps}
      />

      <ChatOverlays {...overlayProps} />
    </div>
  )
}
