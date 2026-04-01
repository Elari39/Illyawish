import { describe, expect, it } from 'vitest'

import type { ChatSettings, Conversation } from '../../../../types/chat'
import {
  buildConversationMetadataUpdate,
  buildDraftConversationSettings,
  parseConversationTags,
  sanitizeConversationFolder,
} from './helpers'

const chatSettings: ChatSettings = {
  globalPrompt: 'Saved global prompt',
  providerPresetId: 2,
  model: 'gpt-4.1-mini',
  temperature: 0.6,
  maxTokens: 512,
  contextWindowTurns: 8,
}

const currentConversation: Conversation = {
  id: 'conversation-1' as Conversation['id'],
  title: 'Conversation 1',
  isPinned: false,
  isArchived: false,
  folder: 'Existing folder',
  tags: ['alpha', 'beta'],
  knowledgeSpaceIds: [7, 8],
  settings: {
    systemPrompt: 'Saved conversation prompt',
    providerPresetId: 11,
    model: 'saved-conversation-model',
    temperature: 0.4,
    maxTokens: 1024,
    contextWindowTurns: 12,
  },
  createdAt: '2026-03-29T00:00:00Z',
  updatedAt: '2026-03-29T00:00:00Z',
}

describe('chat settings helpers', () => {
  it('trims and deduplicates conversation tags while preserving first-seen casing', () => {
    expect(parseConversationTags(' Alpha, beta,alpha, , BETA , Gamma ')).toEqual([
      'Alpha',
      'beta',
      'Gamma',
    ])
  })

  it('builds metadata updates only for changed fields', () => {
    expect(
      buildConversationMetadataUpdate(
        'Existing folder',
        ['alpha', 'gamma'],
        [7, 8, 9],
        currentConversation,
      ),
    ).toEqual({
      tags: ['alpha', 'gamma'],
      knowledgeSpaceIds: [7, 8, 9],
    })
  })

  it('builds new-chat draft settings from persisted chat defaults', () => {
    expect(
      buildDraftConversationSettings(chatSettings, 'Draft prompt'),
    ).toEqual({
      systemPrompt: 'Draft prompt',
      providerPresetId: 2,
      model: 'gpt-4.1-mini',
      temperature: 0.6,
      maxTokens: 512,
      contextWindowTurns: 8,
    })
  })

  it('sanitizes folder names by trimming whitespace', () => {
    expect(sanitizeConversationFolder('  Projects / Alpha  ')).toBe(
      'Projects / Alpha',
    )
  })
})
