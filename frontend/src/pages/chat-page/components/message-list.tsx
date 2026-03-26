import type { RefObject } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import type { Conversation, Message } from '../../../types/chat'
import { EmptyState } from './empty-state'
import { MessageBubble } from './message-bubble'

interface MessageListProps {
  activeConversationId: number | null
  hasConversationShell: boolean
  isLoadingMessages: boolean
  messages: Message[]
  latestUserMessage: Message | null
  latestAssistantMessage: Message | null
  isSending: boolean
  editingMessageId: number | null
  conversations: Conversation[]
  restorableConversationId: number | null
  viewportRef: RefObject<HTMLDivElement | null>
  onContinueLast: () => void
  onEditMessage: (message: Message) => void
  onRetryMessage: (message: Message) => void
  onRegenerate: () => void
}

export function MessageList({
  activeConversationId,
  hasConversationShell,
  isLoadingMessages,
  messages,
  latestUserMessage,
  latestAssistantMessage,
  isSending,
  editingMessageId,
  conversations,
  restorableConversationId,
  viewportRef,
  onContinueLast,
  onEditMessage,
  onRetryMessage,
  onRegenerate,
}: MessageListProps) {
  const { t } = useI18n()

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-8 md:px-8 md:py-10"
      ref={viewportRef}
    >
      {(activeConversationId && isLoadingMessages) ||
      (activeConversationId && !hasConversationShell && messages.length === 0) ? (
        <div className="px-2 py-8 text-sm text-[var(--muted-foreground)]">
          {t('chat.loadingConversation')}
        </div>
      ) : messages.length > 0 ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              canEdit={
                !isSending &&
                latestUserMessage?.id === message.id &&
                message.role === 'user'
              }
              canRetry={
                !isSending &&
                latestAssistantMessage?.id === message.id &&
                message.role === 'assistant' &&
                (message.status === 'failed' || message.status === 'cancelled')
              }
              canRegenerate={
                !isSending &&
                latestAssistantMessage?.id === message.id &&
                message.role === 'assistant' &&
                message.status === 'completed'
              }
              isEditing={editingMessageId === message.id}
              message={message}
              onEdit={() => onEditMessage(message)}
              onRegenerate={onRegenerate}
              onRetry={() => onRetryMessage(message)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          hasConversations={conversations.length > 0}
          hasLastConversation={restorableConversationId != null}
          onContinueLast={onContinueLast}
        />
      )}
    </div>
  )
}
