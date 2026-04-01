import type {
  FormEvent,
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'

import type { I18nContextValue } from '../../../../i18n/context'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  Message,
  StreamEvent,
} from '../../../../types/chat'
import type { ComposerAttachment } from '../../types'
import type { ActiveGenerationState } from '../chat-generation-types'

export interface UseChatGenerationOptions {
  activeConversationId: Conversation['id'] | null
  currentConversation: Conversation | null
  messages: Message[]
  composerValue: string
  selectedAttachments: ComposerAttachment[]
  editingMessageId: number | null
  conversationFolderDraft: string
  conversationTagsDraft: string
  knowledgeSpaceIdsDraft?: number[]
  settingsDraft: ConversationSettings
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
  insertCreatedConversation: (conversation: Conversation) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (
    conversationId: Conversation['id'],
    replace?: boolean,
  ) => void
  setPendingConversation: (conversation: Conversation | null) => void
  setMessages: Dispatch<SetStateAction<Message[]>>
  setIsSending: Dispatch<SetStateAction<boolean>>
  resetComposer: () => void
  activeConversationIdRef: MutableRefObject<Conversation['id'] | null>
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>
  skipNextConversationSyncRef: MutableRefObject<Conversation['id'] | null>
  nextGenerationIdRef: MutableRefObject<number>
  reconcileConversationState: (
    conversationId: Conversation['id'],
    options?: {
      clearErrorOnSuccess?: boolean
      preserveMessages?: Message[]
    },
  ) => Promise<unknown>
  waitForConversationToSettle: (
    conversationId: Conversation['id'],
    options?: { clearErrorOnSuccess?: boolean },
  ) => Promise<unknown>
  cleanupEmptyCreatedConversation: (
    conversationId: Conversation['id'],
  ) => Promise<void>
}

export interface ChatGenerationStreamControls {
  flushActiveMessageDelta: () => void
  handleStreamEventForConversation: (
    event: StreamEvent,
    conversationId: Conversation['id'] | null,
    placeholderId: number,
  ) => void
  readLastEventSeq: (conversationId: Conversation['id']) => number
  resetExecutionState: (conversationId: Conversation['id']) => void
}

export interface ChatGenerationWorkflowContext
  extends UseChatGenerationOptions,
    ChatGenerationStreamControls {}

export interface SubmitHandlerOptions {
  context: Pick<
    ChatGenerationWorkflowContext,
    | 'activeConversationId'
    | 'activeGenerationRef'
    | 'composerValue'
    | 'editingMessageId'
    | 'selectedAttachments'
    | 'setChatError'
    | 't'
  >
  handleEditSubmit: (
    conversationId: Conversation['id'],
    messageId: number,
    content: string,
    attachments: Attachment[],
  ) => Promise<void>
  handleSendSubmit: (content: string, attachments: Attachment[]) => Promise<void>
}

export type ChatGenerationSubmitHandler = (
  event: FormEvent<HTMLFormElement>,
) => Promise<void>
