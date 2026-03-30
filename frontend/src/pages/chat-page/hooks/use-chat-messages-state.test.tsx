import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Message } from '../../../types/chat'
import { useChatMessagesState } from './use-chat-messages-state'

function createMessage(id: number, role: Message['role'], content: string): Message {
  return {
    id,
    conversationId: 'conversation-1',
    role,
    content,
    reasoningContent: '',
    attachments: [],
    status: role === 'assistant' ? 'streaming' : 'completed',
    createdAt: '2026-03-30T00:00:00Z',
  }
}

describe('useChatMessagesState', () => {
  it('does not auto-scroll when messages update during streaming', () => {
    const scrollTo = vi.fn()
    const viewport = {
      scrollTo,
      scrollHeight: 640,
    } as unknown as HTMLDivElement

    const { result } = renderHook(() => useChatMessagesState())

    act(() => {
      result.current.messageViewportRef.current = viewport
    })

    act(() => {
      result.current.setMessages([
        createMessage(1, 'user', 'Hello'),
        createMessage(2, 'assistant', 'Partial reply'),
      ])
    })

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
