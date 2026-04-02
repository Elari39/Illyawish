import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Conversation } from '../../../types/chat'
import {
  clearLastConversationId,
  getAvailableConversationFolders,
  getAvailableConversationTags,
  readDesktopSidebarCollapsedPreference,
  readLastConversationId,
  sortConversations,
  writeLastConversationId,
} from './catalog'
import {
  DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  LAST_CONVERSATION_STORAGE_KEY,
} from '../types'

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

describe('conversation list storage utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('returns safe defaults when localStorage reads fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(readDesktopSidebarCollapsedPreference()).toBe(false)
    expect(readLastConversationId()).toBeNull()
  })

  it('does not throw when writing or clearing the last conversation fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(() => writeLastConversationId('42')).not.toThrow()
    expect(() => clearLastConversationId()).not.toThrow()
  })

  it('reads and writes last conversation ids when storage is available', () => {
    writeLastConversationId('42')

    expect(readLastConversationId()).toBe('42')

    clearLastConversationId('42')

    expect(readLastConversationId()).toBeNull()
  })

  it('parses the desktop sidebar preference from storage', () => {
    window.localStorage.setItem(
      DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      JSON.stringify(true),
    )

    expect(readDesktopSidebarCollapsedPreference()).toBe(true)
  })

  it('leaves an unrelated last conversation id untouched when clearing a different conversation', () => {
    window.localStorage.setItem(LAST_CONVERSATION_STORAGE_KEY, '42')

    clearLastConversationId('7')

    expect(readLastConversationId()).toBe('42')
  })
})

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
