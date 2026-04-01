import { useCallback, useEffect, useRef, type RefObject } from 'react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { Conversation, Message } from '../../../types/chat'
import { EmptyState } from './empty-state'
import { MessageBubble } from './message-bubble'

interface MessageListProps {
  activeConversationId: Conversation['id'] | null
  hasConversationShell: boolean
  hasMoreMessages: boolean
  isLoadingMessages: boolean
  isLoadingOlderMessages: boolean
  messages: Message[]
  latestUserMessage: Message | null
  isSending: boolean
  editingMessageId: number | null
  viewportRef: RefObject<HTMLDivElement | null>
  onShowToast: (message: string, variant?: 'success' | 'error' | 'info') => void
  onEditMessage: (message: Message) => void
  onLoadMore: () => void
  onRetryMessage: (message: Message) => void
  onRegenerateMessage: (message: Message) => void
}

export function MessageList({
  activeConversationId,
  hasConversationShell,
  hasMoreMessages,
  isLoadingMessages,
  isLoadingOlderMessages,
  messages,
  latestUserMessage,
  isSending,
  editingMessageId,
  viewportRef,
  onShowToast,
  onEditMessage,
  onLoadMore,
  onRetryMessage,
  onRegenerateMessage,
}: MessageListProps) {
  const { t } = useI18n()
  const actionHandlersRef = useRef({
    onEditMessage,
    onRetryMessage,
    onRegenerateMessage,
    onShowToast,
  })

  useEffect(() => {
    actionHandlersRef.current = {
      onEditMessage,
      onRetryMessage,
      onRegenerateMessage,
      onShowToast,
    }
  }, [
    onEditMessage,
    onRegenerateMessage,
    onRetryMessage,
    onShowToast,
  ])

  const handleEditMessage = useCallback((message: Message) => {
    actionHandlersRef.current.onEditMessage(message)
  }, [])

  const handleRetryMessage = useCallback((message: Message) => {
    actionHandlersRef.current.onRetryMessage(message)
  }, [])

  const handleRegenerateMessage = useCallback((message: Message) => {
    actionHandlersRef.current.onRegenerateMessage(message)
  }, [])

  const handleCopySuccessToast = useCallback((message: string, variant?: 'success' | 'error' | 'info') => {
    actionHandlersRef.current.onShowToast(message, variant)
  }, [])

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
          {hasMoreMessages ? (
            <div className="flex justify-center">
              <Button
                disabled={isLoadingOlderMessages}
                onClick={onLoadMore}
                variant="secondary"
              >
                {isLoadingOlderMessages
                  ? t('common.loading')
                  : t('common.loadMore')}
              </Button>
            </div>
          ) : null}
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
                message.role === 'assistant' &&
                (message.status === 'failed' || message.status === 'cancelled')
              }
              canRegenerate={
                !isSending &&
                message.role === 'assistant' &&
                message.status === 'completed'
              }
              isEditing={editingMessageId === message.id}
              message={message}
              onCopySuccessToast={handleCopySuccessToast}
              onEditMessage={handleEditMessage}
              onRegenerateMessage={handleRegenerateMessage}
              onRetryMessage={handleRetryMessage}
            />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}
