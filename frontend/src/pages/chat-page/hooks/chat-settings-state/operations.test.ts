import { describe, expect, it } from 'vitest'

import type { ChatSettings, Conversation } from '../../../../types/chat'
import {
  buildConversationDraftSnapshot,
  buildNewChatDraftSnapshot,
  buildSaveSettingsPreparation,
  resolveKnowledgeSpaceToggle,
} from './operations'

const chatSettings: ChatSettings = {
  globalPrompt: 'Saved global prompt',
  providerPresetId: 2,
  model: 'gpt-4.1-mini',
  temperature: 0.6,
  maxTokens: 512,
  contextWindowTurns: 8,
}

const conversation: Conversation = {
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

describe('chat settings operations', () => {
  it('builds save preparation with sanitized metadata and formatted tags', () => {
    expect(
      buildSaveSettingsPreparation({
        conversationFolderDraft: '  Projects  ',
        conversationTagsDraft: 'alpha, gamma, Alpha',
        currentConversation: conversation,
        knowledgeSpaceIdsDraft: [7, 8, 9],
      }),
    ).toEqual({
      metadataUpdate: {
        folder: 'Projects',
        tags: ['alpha', 'gamma'],
      },
      nextFolder: 'Projects',
      nextTags: ['alpha', 'gamma'],
      nextTagsInput: 'alpha, gamma',
    })
  })

  it('builds a draft snapshot from an existing conversation', () => {
    expect(buildConversationDraftSnapshot(conversation)).toEqual({
      conversationFolderDraft: 'Existing folder',
      conversationTagsDraft: 'alpha, beta',
      knowledgeSpaceIdsDraft: [7, 8],
      settingsDraft: conversation.settings,
    })
  })

  it('builds a new-chat draft snapshot from persisted chat defaults and local draft metadata', () => {
    expect(
      buildNewChatDraftSnapshot({
        chatSettings,
        conversationFolderDraft: 'Draft folder',
        conversationTagsDraft: 'draft, tags',
        systemPrompt: 'Draft prompt',
      }),
    ).toEqual({
      conversationFolderDraft: 'Draft folder',
      conversationTagsDraft: 'draft, tags',
      knowledgeSpaceIdsDraft: [],
      settingsDraft: {
        systemPrompt: 'Draft prompt',
        providerPresetId: 2,
        model: 'gpt-4.1-mini',
        temperature: 0.6,
        maxTokens: 512,
        contextWindowTurns: 8,
      },
    })
  })

  it('toggles knowledge space ids without mutating the previous list', () => {
    const previousIds = [7, 8]

    expect(resolveKnowledgeSpaceToggle(previousIds, 9)).toEqual([7, 8, 9])
    expect(resolveKnowledgeSpaceToggle(previousIds, 8)).toEqual([7])
    expect(previousIds).toEqual([7, 8])
  })
})
