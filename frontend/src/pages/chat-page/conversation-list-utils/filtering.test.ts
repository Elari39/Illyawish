import { describe, expect, it } from 'vitest'

import type { Conversation } from '../../../types/chat'
import {
  applyConversationFilters,
  matchesConversationFilters,
  parseConversationTagsInput,
  SIDEBAR_UNFILED_FOLDER_KEY,
} from './filtering'

function createConversation(
  id: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: id as Conversation['id'],
    title: `Conversation ${id}`,
    isPinned: false,
    isArchived: false,
    folder: '',
    tags: [],
    settings: {
      systemPrompt: '',
      providerPresetId: null,
      model: '',
      temperature: 1,
      maxTokens: null,
      contextWindowTurns: null,
    },
    createdAt: '2026-03-26T00:00:00Z',
    updatedAt: '2026-03-26T00:00:00Z',
    ...overrides,
  }
}

describe('conversation list filtering helpers', () => {
  it('matches unfiled conversations through the sidebar sentinel folder key', () => {
    expect(
      matchesConversationFilters(
        createConversation('1', {
          title: 'Roadmap',
          folder: '   ',
          tags: ['alpha'],
        }),
        {
          showArchived: false,
          search: 'road',
          selectedFolder: SIDEBAR_UNFILED_FOLDER_KEY,
          selectedTags: ['ALPHA'],
        },
      ),
    ).toBe(true)
  })

  it('filters and sorts conversations through the shared filter contract', () => {
    const conversations = applyConversationFilters(
      [
        createConversation('1', {
          title: 'Beta',
          updatedAt: '2026-03-26T00:00:00Z',
        }),
        createConversation('2', {
          title: 'Alpha',
          updatedAt: '2026-03-27T00:00:00Z',
          folder: 'Work',
        }),
      ],
      {
        showArchived: false,
        search: 'a',
        selectedFolder: 'Work',
      },
    )

    expect(conversations.map((conversation) => conversation.id)).toEqual(['2'])
  })

  it('deduplicates comma-separated tag input case-insensitively', () => {
    expect(parseConversationTagsInput(' Alpha, beta,alpha, , BETA ')).toEqual([
      'Alpha',
      'beta',
    ])
  })
})
