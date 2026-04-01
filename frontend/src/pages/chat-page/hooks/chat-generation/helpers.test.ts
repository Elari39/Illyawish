import { describe, expect, it } from 'vitest'

import type { ConversationSettings, Message } from '../../../../types/chat'
import {
  buildSubmittedGenerationSettings,
  markAssistantMessageAsFailed,
  resetAssistantGenerationMessage,
} from './helpers'

const draftSettings: ConversationSettings = {
  systemPrompt: 'draft prompt',
  providerPresetId: undefined,
  model: 'draft-model',
  temperature: 0.7,
  maxTokens: 512,
  contextWindowTurns: 6,
}

function createAssistantMessage(
  overrides: Partial<Message> = {},
): Message {
  return {
    id: 21,
    conversationId: '7',
    role: 'assistant',
    content: 'assistant reply',
    reasoningContent: 'reasoning',
    attachments: [],
    status: 'completed',
    createdAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

describe('chat generation helpers', () => {
  it('normalizes submitted generation settings for new conversations', () => {
    expect(buildSubmittedGenerationSettings(draftSettings)).toEqual({
      systemPrompt: 'draft prompt',
      providerPresetId: null,
      model: 'draft-model',
      temperature: 0.7,
      maxTokens: 512,
      contextWindowTurns: 6,
    })
  })

  it('marks the target assistant as failed and preserves existing content when present', () => {
    const messages: Message[] = [
      {
        id: 10,
        conversationId: '7',
        role: 'user',
        content: 'hello',
        reasoningContent: '',
        attachments: [],
        status: 'completed',
        createdAt: '2026-03-26T09:08:00Z',
      },
      createAssistantMessage(),
    ]

    expect(markAssistantMessageAsFailed(messages, 21, 'fallback')).toEqual([
      messages[0],
      {
        ...messages[1],
        status: 'failed',
        content: 'assistant reply',
      },
    ])
  })

  it('resets a streamed assistant message for retry and regenerate flows', () => {
    expect(
      resetAssistantGenerationMessage(
        createAssistantMessage({
          status: 'failed',
          attachments: [{
            id: 'attachment-1',
            url: '/files/attachment-1',
            name: 'file.txt',
            mimeType: 'text/plain',
            size: 1,
          }],
          localReasoningStartedAt: 123,
          localReasoningCompletedAt: 456,
        }),
      ),
    ).toMatchObject({
      content: '',
      reasoningContent: '',
      attachments: [],
      status: 'streaming',
      localReasoningStartedAt: undefined,
      localReasoningCompletedAt: undefined,
    })
  })
})
