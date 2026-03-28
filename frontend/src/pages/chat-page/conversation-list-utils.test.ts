import { describe, expect, it } from 'vitest'

import type { Conversation, ConversationSettings } from '../../types/chat'
import {
  applyConversationFilters,
  applyConversationSync,
  SIDEBAR_UNFILED_FOLDER_KEY,
} from './conversation-list-utils'

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

describe('applyConversationFilters', () => {
  it('filters by selected folder before applying search', () => {
    const conversations = [
      createConversation(1, 'Alpha notes', {
        folder: 'Work',
        updatedAt: '2026-03-28T09:08:00Z',
      }),
      createConversation(2, 'Alpha draft', {
        folder: 'Personal',
        updatedAt: '2026-03-27T09:08:00Z',
      }),
    ]

    const result = applyConversationFilters(conversations, {
      showArchived: false,
      selectedFolder: 'Work',
      selectedTags: [],
      search: 'alpha',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['1'])
  })

  it('filters unfiled conversations using the special folder key', () => {
    const conversations = [
      createConversation(1, 'Filed', {
        folder: 'Work',
      }),
      createConversation(2, 'Loose note'),
    ]

    const result = applyConversationFilters(conversations, {
      showArchived: false,
      selectedFolder: SIDEBAR_UNFILED_FOLDER_KEY,
      selectedTags: [],
      search: '',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['2'])
  })

  it('matches any selected tag when multiple tags are active', () => {
    const conversations = [
      createConversation(1, 'First', {
        tags: ['urgent'],
        updatedAt: '2026-03-28T09:08:00Z',
      }),
      createConversation(2, 'Second', {
        tags: ['ops'],
        updatedAt: '2026-03-27T09:08:00Z',
      }),
      createConversation(3, 'Third', {
        tags: ['docs'],
        updatedAt: '2026-03-26T09:08:00Z',
      }),
    ]

    const result = applyConversationFilters(conversations, {
      showArchived: false,
      selectedFolder: null,
      selectedTags: ['urgent', 'ops'],
      search: '',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['1', '2'])
  })
})
