import { useCallback, useEffect, useRef, useState } from 'react'

import type { Message } from '../../../types/chat'
import { findLatestMessageByRole } from '../utils'

export function useChatMessagesState() {
  const messageViewportRef = useRef<HTMLDivElement | null>(null)
  const skipNextAutoScrollRef = useRef(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const latestUserMessage = findLatestMessageByRole(messages, 'user')
  const latestAssistantMessage = findLatestMessageByRole(messages, 'assistant')

  useEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false
      return
    }

    const viewport = messageViewportRef.current
    if (!viewport) {
      return
    }
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  const skipNextMessageAutoScroll = useCallback(() => {
    skipNextAutoScrollRef.current = true
  }, [])

  return {
    messageViewportRef,
    messages,
    isLoadingMessages,
    isSending,
    latestUserMessage,
    latestAssistantMessage,
    skipNextMessageAutoScroll,
    setMessages,
    setIsLoadingMessages,
    setIsSending,
  }
}
