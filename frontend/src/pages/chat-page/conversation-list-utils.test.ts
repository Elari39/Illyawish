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
  id: number | string,
  title: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: String(id) as Conversation['id'],
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
  it('keeps an already visible conversation when search may match message content', () => {
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

    expect(result.conversations.map((conversation) => conversation.id)).toEqual(['11'])
    expect(result.totalDelta).toBe(0)
    expect(result.loadedDelta).toBe(0)
  })

  it('does not insert a not-yet-visible conversation during search from partial local metadata', () => {
    const result = applyConversationSync(
      [],
      createConversation(12, 'Alpha', {
        folder: 'alpha',
      }),
      {
        showArchived: false,
        search: 'alpha',
      },
    )

    expect(result.conversations).toEqual([])
    expect(result.totalDelta).toBe(0)
    expect(result.loadedDelta).toBe(0)
  })

  it('increments both total and loaded counts when an existing conversation becomes visible locally', () => {
    const result = applyConversationSync(
      [],
      createConversation(13, 'Alpha', {
        folder: 'alpha',
      }),
      {
        showArchived: false,
        search: '',
      },
      {
        updateCountsForVisibilityChange: true,
      },
    )

    expect(result.conversations.map((conversation) => conversation.id)).toEqual(['13'])
    expect(result.totalDelta).toBe(1)
    expect(result.loadedDelta).toBe(1)
  })

  it('keeps loaded count unchanged for a newly created local conversation', () => {
    const result = applyConversationSync(
      [],
      createConversation(14, 'Alpha', {
        folder: 'alpha',
      }),
      {
        showArchived: false,
        search: '',
      },
      {
        countAsNew: true,
      },
    )

    expect(result.conversations.map((conversation) => conversation.id)).toEqual(['14'])
    expect(result.totalDelta).toBe(1)
    expect(result.loadedDelta).toBe(0)
  })
})
