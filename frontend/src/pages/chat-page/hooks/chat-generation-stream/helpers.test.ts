import { describe, expect, it } from 'vitest'

import type { Message } from '../../../../types/chat'
import {
  buildMessageTarget,
  markReasoningCompleted,
} from './helpers'

function createMessage(
  id: number,
  status: Message['status'],
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: '7',
    role: 'assistant',
    content: '',
    reasoningContent: '',
    attachments: [],
    status,
    createdAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

describe('chat generation stream helpers', () => {
  it('builds a stream target from the active generation when conversations match', () => {
    expect(
      buildMessageTarget(
        {
          conversationId: '7',
          messageId: 42,
        },
        '7',
        -1,
      ),
    ).toEqual({
      conversationId: '7',
      placeholderId: -1,
      messageId: 42,
    })

    expect(
      buildMessageTarget(
        {
          conversationId: '8',
          messageId: 42,
        },
        '7',
        -1,
      ),
    ).toEqual({
      conversationId: '7',
      placeholderId: -1,
      messageId: null,
    })
  })

  it('marks reasoning as completed only for streaming assistants with a started timestamp', () => {
    const observedAt = 456
    const target = {
      conversationId: '7',
      placeholderId: -1,
      messageId: 21,
    }

    expect(
      markReasoningCompleted(
        [
          createMessage(21, 'streaming', {
            localReasoningStartedAt: 123,
          }),
        ],
        target,
        observedAt,
      ),
    ).toEqual([
      createMessage(21, 'streaming', {
        localReasoningStartedAt: 123,
        localReasoningCompletedAt: observedAt,
      }),
    ])

    expect(
      markReasoningCompleted(
        [
          createMessage(21, 'streaming'),
        ],
        target,
        observedAt,
      ),
    ).toEqual([
      createMessage(21, 'streaming'),
    ])
  })
})
