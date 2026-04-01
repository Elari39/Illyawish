import { describe, expect, it } from 'vitest'

import type { Conversation } from '../../../../types/chat'
import {
  deriveVisibleConversations,
  pruneSelectedConversationIds,
  reconcileConversationFilterState,
  resolvePageConversations,
} from './reducer-helpers'

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

describe('conversation list reducer helpers', () => {
  it('prunes selected ids that are no longer visible', () => {
    expect(
      pruneSelectedConversationIds(
        ['1' as Conversation['id'], '3' as Conversation['id']],
        [createConversation('1'), createConversation('2')],
      ),
    ).toEqual(['1'])
  })

  it('reconciles selected folder and tags against the newly loaded conversations', () => {
    expect(
      reconcileConversationFilterState(
        [
          createConversation('1', { folder: 'Work', tags: ['urgent'] }),
          createConversation('2', { folder: '', tags: ['planning'] }),
        ],
        false,
        'Missing',
        ['urgent', 'ghost'],
      ),
    ).toEqual({
      selectedFolder: null,
      selectedTags: ['urgent'],
    })
  })

  it('preserves the active conversation on replacement pages when it still matches filters', () => {
    const activeConversation = createConversation('9', {
      title: 'Active note',
      updatedAt: '2026-03-29T00:00:00Z',
    })

    expect(
      resolvePageConversations({
        activeConversation,
        activeConversationId: '9',
        append: false,
        conversations: [createConversation('1')],
        search: '',
        showArchived: false,
      }).map((conversation) => conversation.id),
    ).toEqual(['9', '1'])
  })

  it('derives visible conversations with the shared filter contract', () => {
    expect(
      deriveVisibleConversations(
        [
          createConversation('1', { folder: 'Work', tags: ['ops'] }),
          createConversation('2', { folder: 'Personal', tags: ['docs'] }),
        ],
        {
          conversationSearch: '',
          selectedFolder: 'Work',
          selectedTags: [],
          showArchived: false,
        },
      ).map((conversation) => conversation.id),
    ).toEqual(['1'])
  })
})
