import { describe, expect, it } from 'vitest'

import type { Conversation } from '../../../types/chat'
import {
  getAvailableConversationFolders,
  getAvailableConversationTags,
  sortConversations,
} from './catalog'

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

describe('conversation list catalog helpers', () => {
  it('collects unique non-empty folders in alphabetical order', () => {
    expect(
      getAvailableConversationFolders([
        createConversation('1', { folder: ' Work ' }),
        createConversation('2', { folder: '' }),
        createConversation('3', { folder: 'Personal' }),
      ]),
    ).toEqual(['Personal', 'Work'])
  })

  it('collects tags for the active folder only', () => {
    expect(
      getAvailableConversationTags(
        [
          createConversation('1', { folder: 'Work', tags: ['alpha', 'beta'] }),
          createConversation('2', { folder: 'Personal', tags: ['gamma'] }),
        ],
        'Work',
      ),
    ).toEqual(['alpha', 'beta'])
  })

  it('sorts pinned conversations first and then by updated time descending', () => {
    expect(
      sortConversations([
        createConversation('1', { updatedAt: '2026-03-26T00:00:00Z' }),
        createConversation('2', {
          isPinned: true,
          updatedAt: '2026-03-25T00:00:00Z',
        }),
        createConversation('3', { updatedAt: '2026-03-27T00:00:00Z' }),
      ]).map((conversation) => conversation.id),
    ).toEqual(['2', '3', '1'])
  })
})
