import { formatMessage, messages } from '../../i18n/messages'
import type { I18nContextValue } from '../../i18n/context'
import {
  appendToStreamingMessage,
  buildConversationMarkdown,
  upsertMessage,
} from './utils'

const t: I18nContextValue['t'] = (key, values) =>
  formatMessage(messages['en-US'][key], values)

describe('chat page utils', () => {
  it('appends deltas to the latest streaming assistant message', () => {
    const result = appendToStreamingMessage(
      [
        {
          id: 1,
          conversationId: 1,
          role: 'assistant',
          content: 'Hello',
          attachments: [],
          status: 'streaming',
          createdAt: '2026-03-26T00:00:00Z',
        },
      ],
      ' world',
    )

    expect(result[0]?.content).toBe('Hello world')
  })

  it('replaces a placeholder message when the real streamed message arrives', () => {
    const result = upsertMessage(
      [
        {
          id: -1,
          conversationId: 1,
          role: 'assistant',
          content: '',
          attachments: [],
          status: 'streaming',
          createdAt: '2026-03-26T00:00:00Z',
        },
      ],
      {
        id: 99,
        conversationId: 1,
        role: 'assistant',
        content: 'Finished',
        attachments: [],
        status: 'completed',
        createdAt: '2026-03-26T00:00:01Z',
      },
      -1,
    )

    expect(result).toEqual([
      expect.objectContaining({
        id: 99,
        content: 'Finished',
        status: 'completed',
      }),
    ])
  })

  it('exports conversation history as markdown', () => {
    const markdown = buildConversationMarkdown(
      {
        id: 1,
        title: 'Project notes',
        isPinned: false,
        isArchived: false,
        settings: {
          systemPrompt: 'You are a helpful assistant.',
          model: 'gpt-4.1-mini',
          temperature: 1,
          maxTokens: null,
        },
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-27T12:34:56Z',
      },
      [
        {
          id: 1,
          conversationId: 1,
          role: 'user',
          content: 'Summarize this project.',
          attachments: [],
          status: 'completed',
          createdAt: '2026-03-26T00:00:00Z',
        },
        {
          id: 2,
          conversationId: 1,
          role: 'assistant',
          content: 'Here is the summary.',
          attachments: [],
          status: 'completed',
          createdAt: '2026-03-26T00:00:01Z',
        },
      ],
      'en-US',
      t,
    )

    expect(markdown).toContain('# Project notes')
    expect(markdown).toContain('## User')
    expect(markdown).toContain('## Assistant')
    expect(markdown).toContain('Here is the summary.')
  })
})
