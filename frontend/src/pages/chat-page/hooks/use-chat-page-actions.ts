import { createBulkActionHandlers } from './chat-page-actions/bulk-actions'
import { createConversationActionHandlers } from './chat-page-actions/conversation-actions'
import { createProviderActionHandlers } from './chat-page-actions/provider-actions'
import type { UseChatPageActionsOptions } from './chat-page-actions/types'

export function useChatPageActions({
  activeConversationId,
  contextBarSettings,
  interactionDisabled,
  conversationList,
  chatSession,
  providerSettings,
  uiState,
  navigate,
  navigateHome,
  logout,
  setIsSavingSettings,
  setChatError,
  t,
}: UseChatPageActionsOptions) {
  const conversationActions = createConversationActionHandlers({
    activeConversationId,
    interactionDisabled,
    conversationList,
    chatSession,
    uiState,
    navigateHome,
    logout,
    setChatError,
    t,
  })
  const providerActions = createProviderActionHandlers({
    activeConversationId,
    contextBarSettings,
    conversationList,
    chatSession,
    providerSettings,
    uiState,
    navigate,
    setIsSavingSettings,
    setChatError,
    t,
  })
  const bulkActions = createBulkActionHandlers({
    conversationList,
    uiState,
    setChatError,
    t,
  })

  return {
    ...conversationActions,
    ...bulkActions,
    handleLogout: async () => {
      await conversationActions.handleLogout()
      await providerActions.handleNavigateToLogin()
    },
    handleSaveSettings: providerActions.handleSaveSettings,
    handleProviderModelChange: providerActions.handleProviderModelChange,
    handleSetDefaultProviderModel: providerActions.handleSetDefaultProviderModel,
    handleDeleteProvider: providerActions.handleDeleteProvider,
  }
}
