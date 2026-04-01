import { describe, expect, it } from 'vitest'

import type { Message } from '../../../../types/chat'
import {
  hasStreamingAssistantMessage,
  mergeOlderHistoryMessages,
  resolveHistoryPagination,
} from './helpers'

function createMessage(
  id: number,
  role: Message['role'],
  status: Message['status'],
): Message {
  return {
    id,
    conversationId: '7',
    role,
    content: `${role}-${status}`,
    reasoningContent: '',
    attachments: [],
    status,
    createdAt: '2026-03-26T09:08:00Z',
  }
}

describe('chat history helpers', () => {
  it('normalizes missing pagination metadata', () => {
    expect(resolveHistoryPagination({ pagination: undefined })).toEqual({
      hasMoreMessages: false,
      nextBeforeMessageId: null,
    })
  })

  it('detects whether a snapshot still contains a streaming assistant', () => {
    expect(
      hasStreamingAssistantMessage([
        createMessage(1, 'user', 'completed'),
        createMessage(2, 'assistant', 'streaming'),
      ]),
    ).toBe(true)

    expect(
      hasStreamingAssistantMessage([
        createMessage(1, 'user', 'completed'),
        createMessage(2, 'assistant', 'completed'),
      ]),
    ).toBe(false)
  })

  it('prepends older history pages without duplicating existing messages', () => {
    expect(
      mergeOlderHistoryMessages(
        [createMessage(1, 'user', 'completed'), createMessage(2, 'assistant', 'completed')],
        [createMessage(2, 'assistant', 'completed'), createMessage(3, 'user', 'completed')],
      ).map((message) => message.id),
    ).toEqual([1, 2, 3])
  })
})
