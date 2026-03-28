import { describe, expect, it } from 'vitest'

import type { Conversation, ConversationSettings } from '../../types/chat'
import { applyConversationSync } from './conversation-list-utils'

const defaultSettings: ConversationSettings = {
  systemPrompt: '',
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}

function createConversation(
  id: number,
  title: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    title,
    isPinned: false,
    isArchived: false,
    folder: '',
    tags: [],
    settings: defaultSettings,
    createdAt: '2026-03-26T09:08:00Z',
    updatedAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

describe('applyConversationSync', () => {
  it('preserves an already visible conversation even when local metadata does not match the search term', () => {
    const existingConversation = createConversation(11, 'Alpha')

    const result = applyConversationSync(
      [existingConversation],
      {
        ...existingConversation,
        updatedAt: '2026-03-28T09:08:00Z',
      },
      {
        showArchived: false,
        search: 'needle in message body',
      },
    )

    expect(result.conversations.map((conversation) => conversation.id)).toEqual([11])
    expect(result.totalDelta).toBe(0)
    expect(result.loadedDelta).toBe(0)
  })
})
