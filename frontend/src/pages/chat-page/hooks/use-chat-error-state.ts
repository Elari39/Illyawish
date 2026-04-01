import { useState } from 'react'

import type { ChatErrorState } from '../types'

export function useChatErrorState() {
  const [chatError, setChatErrorState] = useState<ChatErrorState | null>(null)

  function clearChatError() {
    setChatErrorState(null)
  }

  function showChatError(message: string) {
    setChatErrorState({
      id: Date.now() + Math.random(),
      message,
    })
  }

  function setChatError(value: string | null) {
    if (value == null) {
      clearChatError()
      return
    }

    showChatError(value)
  }

  return {
    chatError,
    setChatError,
    showChatError,
    clearChatError,
  }
}
