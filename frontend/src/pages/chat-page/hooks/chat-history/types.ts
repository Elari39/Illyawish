import type { MutableRefObject } from 'react'

import type { I18nContextValue } from '../../../../i18n/context'
import type {
  Conversation,
  ConversationMessagesResponse,
  Message,
} from '../../../../types/chat'

export interface UseChatHistoryOptions {
  activeConversationId: Conversation['id'] | null
  search: string
  showArchived: boolean
  setChatError: (value: string | null) => void
  syncConversationIntoList: (
    conversation: Conversation,
    options?: { updateCountsForVisibilityChange?: boolean },
  ) => void
  navigateHome: (replace?: boolean) => void
  setSkipAutoResume: (value: boolean) => void
  t: I18nContextValue['t']
  activeConversationIdRef: MutableRefObject<Conversation['id'] | null>
  activeGenerationRef: MutableRefObject<{
    conversationId: Conversation['id']
  } | null>
  skipNextConversationSyncRef: MutableRefObject<Conversation['id'] | null>
  messageViewportRef: MutableRefObject<HTMLDivElement | null>
  clearEditingMessage: () => void
  resetForNewChatSettings: () => void
  setConversationFolderDraft: (value: string) => void
  setConversationTagsDraft: (value: string) => void
  setPendingConversation: (conversation: Conversation | null) => void
  setSettingsDraft: (value: Conversation['settings']) => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setIsLoadingMessages: (value: boolean) => void
  setIsSending: (value: boolean) => void
}

export interface ChatHistoryOperationContext
  extends Omit<
    UseChatHistoryOptions,
    | 'search'
    | 'showArchived'
    | 'syncConversationIntoList'
    | 'navigateHome'
    | 'setSkipAutoResume'
    | 't'
  > {
  applyConversationSnapshot: ApplyConversationSnapshot
  hasMoreMessagesRef: MutableRefObject<boolean>
  nextBeforeMessageIdRef: MutableRefObject<number | null>
  isLoadingOlderMessagesRef: MutableRefObject<boolean>
  setHasMoreMessages: React.Dispatch<React.SetStateAction<boolean>>
  setNextBeforeMessageId: React.Dispatch<React.SetStateAction<number | null>>
  setIsLoadingOlderMessages: React.Dispatch<React.SetStateAction<boolean>>
  syncConversationIntoListRef: MutableRefObject<
    UseChatHistoryOptions['syncConversationIntoList']
  >
  navigateHomeRef: MutableRefObject<UseChatHistoryOptions['navigateHome']>
  setSkipAutoResumeRef: MutableRefObject<
    UseChatHistoryOptions['setSkipAutoResume']
  >
  tRef: MutableRefObject<UseChatHistoryOptions['t']>
}

export interface ReconcileConversationOptions {
  clearErrorOnSuccess?: boolean
  preserveMessages?: Message[]
}

export interface ApplyConversationSnapshot {
  (
    response: ConversationMessagesResponse,
    replaceMessages: boolean,
    preserveMessages?: Message[],
  ): void
}
