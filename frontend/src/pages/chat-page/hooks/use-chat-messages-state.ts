import { useRef, useState } from 'react'

import type { Message } from '../../../types/chat'
import { findLatestMessageByRole } from '../utils'

export function useChatMessagesState() {
  const messageViewportRef = useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const latestUserMessage = findLatestMessageByRole(messages, 'user')
  const latestAssistantMessage = findLatestMessageByRole(messages, 'assistant')

  return {
    messageViewportRef,
    messages,
    isLoadingMessages,
    isSending,
    latestUserMessage,
    latestAssistantMessage,
    setMessages,
    setIsLoadingMessages,
    setIsSending,
  }
}
