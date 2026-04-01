import type { Dispatch, SetStateAction } from 'react'

import type { I18nContextValue } from '../../../../i18n/context'
import type { Conversation, ConversationSettings } from '../../../../types/chat'
import type { useChatSession } from '../use-chat-session'
import type { useChatUIState } from '../use-chat-ui-state'
import type { useConversationList } from '../use-conversation-list'
import type { useProviderSettings } from '../use-provider-settings'

export type ConversationListController = ReturnType<typeof useConversationList>
export type ChatSessionController = ReturnType<typeof useChatSession>
export type ProviderSettingsController = ReturnType<typeof useProviderSettings>
export type ChatUIStateController = ReturnType<typeof useChatUIState>

export interface UseChatPageActionsOptions {
  activeConversationId: Conversation['id'] | null
  contextBarSettings: ConversationSettings
  interactionDisabled: boolean
  conversationList: ConversationListController
  chatSession: ChatSessionController
  providerSettings: ProviderSettingsController
  uiState: ChatUIStateController
  navigate: (to: string, options?: { replace?: boolean }) => void
  navigateHome: (replace?: boolean) => void
  logout: () => Promise<void>
  setIsSavingSettings: Dispatch<SetStateAction<boolean>>
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
}
