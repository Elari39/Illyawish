import { describe, expect, it } from 'vitest'

import type { Message } from '../../types/chat'
import {
  formatReasoningDuration,
  getDisplayMessageParts,
  getMessageCopyText,
  getReasoningPreview,
  mergePreservedMessages,
  parseReasoningContent,
} from './message-utils'

function createMessage(
  id: number,
  role: Message['role'],
  status: Message['status'],
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: '7',
    role,
    content: `${role}-${status}`,
    attachments: [],
    status,
    createdAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

describe('mergePreservedMessages', () => {
  it('keeps preserved local messages when the server snapshot is missing them', () => {
    const merged = mergePreservedMessages(
      [
        createMessage(1, 'user', 'completed'),
      ],
      [
        createMessage(1, 'user', 'completed'),
        createMessage(2, 'assistant', 'failed', {
          content: 'error.completeReply',
        }),
        createMessage(3, 'user', 'completed', {
          content: 'optimistic question',
        }),
      ],
    )

    expect(merged).toEqual([
      createMessage(1, 'user', 'completed'),
      createMessage(2, 'assistant', 'failed', {
        content: 'error.completeReply',
      }),
      createMessage(3, 'user', 'completed', {
        content: 'optimistic question',
      }),
    ])
  })

  it('prefers preserved failed messages over stale server snapshots with the same id', () => {
    const merged = mergePreservedMessages(
      [
        createMessage(2, 'assistant', 'completed', {
          content: 'old server answer',
        }),
      ],
      [
        createMessage(2, 'assistant', 'failed', {
          content: 'error.completeReply',
        }),
      ],
    )

    expect(merged).toEqual([
      createMessage(2, 'assistant', 'failed', {
        content: 'error.completeReply',
      }),
    ])
  })

  it('dedupes by id and keeps messages sorted', () => {
    const merged = mergePreservedMessages(
      [
        createMessage(5, 'assistant', 'completed'),
        createMessage(1, 'user', 'completed'),
      ],
      [
        createMessage(3, 'assistant', 'failed'),
        createMessage(1, 'user', 'completed', {
          content: 'same user message',
        }),
      ],
    )

    expect(merged.map((message) => message.id)).toEqual([1, 3, 5])
  })
})

describe('getDisplayMessageParts', () => {
  it('prefers stored reasoningContent over think tags in assistant content', () => {
    expect(getDisplayMessageParts(createMessage(10, 'assistant', 'completed', {
      reasoningContent: 'stored reasoning',
      content: '<think>legacy reasoning</think>Visible answer',
    }))).toEqual({
      reasoningContent: 'stored reasoning',
      content: '<think>legacy reasoning</think>Visible answer',
    })
  })

  it('splits only the leading think block for legacy assistant messages', () => {
    expect(getDisplayMessageParts(createMessage(11, 'assistant', 'completed', {
      content: '  <think>legacy reasoning</think>Visible answer<think>kept</think>',
    }))).toEqual({
      reasoningContent: 'legacy reasoning',
      content: 'Visible answer<think>kept</think>',
    })
  })

  it('does not split think tags for non-assistant messages', () => {
    expect(getDisplayMessageParts(createMessage(12, 'user', 'completed', {
      content: '<think>literal</think>question',
    }))).toEqual({
      reasoningContent: '',
      content: '<think>literal</think>question',
    })
  })
})

describe('getMessageCopyText', () => {
  it('copies reasoning first and content second when both exist', () => {
    expect(getMessageCopyText(createMessage(20, 'assistant', 'completed', {
      reasoningContent: 'step 1\nstep 2',
      content: 'final answer',
    }))).toBe('step 1\nstep 2\n\nfinal answer')
  })

  it('falls back to legacy think splitting for copy output', () => {
    expect(getMessageCopyText(createMessage(21, 'assistant', 'completed', {
      content: '<think>legacy reasoning</think>final answer',
    }))).toBe('legacy reasoning\n\nfinal answer')
  })
})

describe('getReasoningPreview', () => {
  it('keeps the first two lines and truncates the rest with an ellipsis', () => {
    expect(getReasoningPreview('step 1\nstep 2\nstep 3')).toBe('step 1\nstep 2…')
  })
})

describe('parseReasoningContent', () => {
  it('keeps a two-line preview without adding an ellipsis', () => {
    expect(parseReasoningContent('step 1\nstep 2')).toEqual({
      paragraphs: ['step 1', 'step 2'],
      preview: 'step 1\nstep 2',
      totalSteps: 2,
    })
  })

  it('ignores blank lines when counting steps', () => {
    expect(parseReasoningContent('step 1\n\nstep 2\nstep 3')).toEqual({
      paragraphs: ['step 1', 'step 2', 'step 3'],
      preview: 'step 1\nstep 2…',
      totalSteps: 3,
    })
  })
})

describe('formatReasoningDuration', () => {
  it('formats short reasoning durations in seconds', () => {
    expect(formatReasoningDuration(18_400)).toBe('18s')
  })

  it('formats longer reasoning durations in minutes and seconds', () => {
    expect(formatReasoningDuration(65_000)).toBe('1m 05s')
  })
})
