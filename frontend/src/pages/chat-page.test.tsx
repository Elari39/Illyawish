import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../components/auth/auth-context'
import { I18nProvider } from '../i18n/provider'
import { APP_LOCALE_STORAGE_KEY } from '../i18n/config'
import { AUTH_UNAUTHORIZED_EVENT, chatApi } from '../lib/api'
import { LAST_CONVERSATION_STORAGE_KEY } from './chat-page/types'
import { ChatPage } from './chat-page'
import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
  Message,
} from '../types/chat'

const defaultSettings: ConversationSettings = {
  systemPrompt: '',
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}

function createChatSettings(
  overrides: Partial<ChatSettings> = {},
): ChatSettings {
  return {
    globalPrompt: '',
    model: '',
    temperature: 1,
    maxTokens: null,
    contextWindowTurns: null,
    ...overrides,
  }
}

const authValue: AuthContextValue = {
  user: {
    id: 1,
    username: 'Elaina',
    role: 'admin',
    status: 'active',
    lastLoginAt: null,
  },
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}

function createConversation(
  id: number,
  title: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    title,
    isPinned: false,
    isArchived: false,
    folder: '',
    tags: [],
    settings: defaultSettings,
    createdAt: '2026-03-26T09:08:00Z',
    updatedAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

function createMessage(
  id: number,
  conversationId: number,
  role: Message['role'],
  content: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    attachments: [],
    status: 'completed',
    createdAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location">{location.pathname}</div>
}

function RouteShell() {
  return (
    <>
      <ChatPage />
      <LocationProbe />
    </>
  )
}

function renderChatPage(initialEntries: string[]) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={initialEntries}>
        <I18nProvider>
          <Routes>
            <Route path="/chat" element={<RouteShell />} />
            <Route path="/chat/:conversationId" element={<RouteShell />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ChatPage conversation navigation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'en-US')
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(chatApi, 'getChatSettings').mockResolvedValue({
      ...createChatSettings(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('auto-resumes the last conversation without reloading it in a loop', async () => {
    const resumedConversation = createConversation(7, 'Resume me')
    const resumedMessages = [
      createMessage(11, 7, 'user', 'Hello again'),
      createMessage(12, 7, 'assistant', 'Welcome back'),
    ]

    window.localStorage.setItem(LAST_CONVERSATION_STORAGE_KEY, '7')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [resumedConversation],
      total: 1,
    })
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockResolvedValue({
        conversation: resumedConversation,
        messages: resumedMessages,
      })

    renderChatPage(['/chat'])

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/7')
    })

    await waitFor(() => {
      expect(screen.getByText('Welcome back')).toBeInTheDocument()
    })

    expect(getConversationMessagesMock).toHaveBeenCalledTimes(1)
    expect(getConversationMessagesMock).toHaveBeenCalledWith(7)
    expect(screen.queryByText('Loading conversation...')).not.toBeInTheDocument()
  })

  it('opens a clicked history conversation exactly once', async () => {
    const firstConversation = createConversation(1, 'First chat')
    const secondConversation = createConversation(2, 'Second chat', {
      updatedAt: '2026-03-26T10:08:00Z',
    })

    const listConversationsPageMock = vi
      .spyOn(chatApi, 'listConversationsPage')
      .mockResolvedValue({
        conversations: [secondConversation, firstConversation],
        total: 2,
      })
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockImplementation(async (conversationId: number) => ({
        conversation: conversationId === 1 ? firstConversation : secondConversation,
        messages: [
          createMessage(
            conversationId * 10,
            conversationId,
            'assistant',
            conversationId === 1 ? 'Loaded first conversation' : 'Loaded second conversation',
          ),
        ],
      }))

    renderChatPage(['/chat/1'])

    await waitFor(() => {
      expect(screen.getByText('Loaded first conversation')).toBeInTheDocument()
    })

    const historyButtons = await screen.findAllByRole('button', { name: 'Second chat' })
    fireEvent.click(historyButtons[historyButtons.length - 1]!)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/2')
    })

    await waitFor(() => {
      expect(screen.getByText('Loaded second conversation')).toBeInTheDocument()
    })

    expect(listConversationsPageMock).toHaveBeenCalledTimes(1)
    expect(
      getConversationMessagesMock.mock.calls.filter(([conversationId]) => conversationId === 2),
    ).toHaveLength(1)
  })

  it('navigates to the created conversation after sending the first message', async () => {
    const createdConversation = createConversation(5, 'Fresh chat')
    const streamedMessages = [
      createMessage(51, 5, 'user', 'Hello from test'),
      createMessage(52, 5, 'assistant', 'Hi there'),
    ]

    vi.spyOn(chatApi, 'listConversationsPage')
      .mockResolvedValueOnce({
        conversations: [],
        total: 0,
      })
      .mockResolvedValue({
        conversations: [createdConversation],
        total: 1,
      })

    const createConversationMock = vi
      .spyOn(chatApi, 'createConversation')
      .mockResolvedValue(createdConversation)
    const updateConversationMock = vi
      .spyOn(chatApi, 'updateConversation')
      .mockImplementation(async (conversationId, payload) => ({
        ...createdConversation,
        id: conversationId,
        settings: payload.settings ?? createdConversation.settings,
      }))
    const streamMessageMock = vi
      .spyOn(chatApi, 'streamMessage')
      .mockImplementation(async (conversationId, _payload, onEvent) => {
        await onEvent({
          type: 'done',
          message: createMessage(52, conversationId, 'assistant', 'Hi there'),
        })
      })
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockResolvedValue({
        conversation: createdConversation,
        messages: streamedMessages,
      })

    renderChatPage(['/chat'])

    const textarea = await screen.findByPlaceholderText('Message Illyawish...')
    fireEvent.change(textarea, { target: { value: 'Hello from test' } })

    const form = textarea.closest('form')
    if (!form) {
      throw new Error('Composer form not found')
    }

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/5')
    })

    await waitFor(() => {
      expect(screen.getByText('Hi there')).toBeInTheDocument()
    })

    expect(createConversationMock).toHaveBeenCalledTimes(1)
    expect(updateConversationMock).toHaveBeenCalledTimes(1)
    expect(streamMessageMock).toHaveBeenCalledTimes(1)
    expect(
      getConversationMessagesMock.mock.calls.filter(([conversationId]) => conversationId === 5),
    ).toHaveLength(2)
  })

  it('exposes accessible icon controls with Illyawish branding', async () => {
    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [],
      total: 0,
    })

    renderChatPage(['/chat'])

    expect(await screen.findByPlaceholderText('Message Illyawish...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open conversation sidebar' })).toBeInTheDocument()
    expect(screen.getAllByText('Illyawish').length).toBeGreaterThan(0)
  })

  it('moves language and export actions from the header into settings', async () => {
    const conversation = createConversation(9, 'Imported layout test')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages: [createMessage(91, 9, 'assistant', 'Visible message')],
    })

    renderChatPage(['/chat/9'])

    await waitFor(() => {
      expect(screen.getByText('Visible message')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Language' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(await screen.findByRole('button', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import / Export' })).toBeInTheDocument()
  })

  it('opens settings for legacy conversations whose tags come back as null', async () => {
    vi.restoreAllMocks()

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/api/chat/settings')) {
        return new Response(
          JSON.stringify(createChatSettings()),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )
      }

      if (url.includes('/api/conversations?')) {
        return new Response(
          JSON.stringify({
            conversations: [
              {
                id: 9,
                title: 'Legacy settings',
                isPinned: false,
                isArchived: false,
                folder: '',
                tags: null,
                settings: defaultSettings,
                createdAt: '2026-03-26T09:08:00Z',
                updatedAt: '2026-03-26T09:08:00Z',
              },
            ],
            total: 1,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )
      }

      if (url.endsWith('/api/conversations/9/messages')) {
        return new Response(
          JSON.stringify({
            conversation: {
              id: 9,
              title: 'Legacy settings',
              isPinned: false,
              isArchived: false,
              folder: '',
              tags: null,
              settings: defaultSettings,
              createdAt: '2026-03-26T09:08:00Z',
              updatedAt: '2026-03-26T09:08:00Z',
            },
            messages: [createMessage(91, 9, 'assistant', 'Legacy reply')],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )
      }

      if (url.endsWith('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            error: 'unauthorized',
            code: 'unauthorized',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )
      }

      throw new Error(`Unhandled fetch for ${url}`)
    })

    const unauthorizedListener = vi.fn()
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, unauthorizedListener)
    vi.stubGlobal('fetch', fetchMock)

    renderChatPage(['/chat/9'])

    await waitFor(() => {
      expect(screen.getByText('Legacy reply')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tags')).toHaveValue('')
    expect(unauthorizedListener).not.toHaveBeenCalled()

    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, unauthorizedListener)
  })

  it('keeps generation controls out of the header and on each assistant reply', async () => {
    const conversation = createConversation(9, 'Generation controls')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages: [
        createMessage(91, 9, 'user', 'Hello'),
        createMessage(92, 9, 'assistant', 'Reply one'),
        createMessage(93, 9, 'assistant', 'Reply two'),
      ],
    })

    renderChatPage(['/chat/9'])

    await waitFor(() => {
      expect(screen.getByText('Reply two')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Regenerate' })).toHaveLength(2)
  })

  it('loads older messages on demand from the pagination cursor', async () => {
    const conversation = createConversation(9, 'Paged history')
    const initialPage = [
      createMessage(93, 9, 'user', 'Third message'),
      createMessage(94, 9, 'assistant', 'Fourth message'),
    ]
    const olderPage = [
      createMessage(91, 9, 'user', 'First message'),
      createMessage(92, 9, 'assistant', 'Second message'),
    ]

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })

    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockImplementation(async (_conversationId: number, params?: { beforeId?: number; limit?: number }) => {
        if (params?.beforeId === 93) {
          return {
            conversation,
            messages: olderPage,
            pagination: {
              hasMore: false,
              nextBeforeId: null,
            },
          }
        }

        return {
          conversation,
          messages: initialPage,
          pagination: {
            hasMore: true,
            nextBeforeId: 93,
          },
        }
      })

    renderChatPage(['/chat/9'])

    await waitFor(() => {
      expect(screen.getByText('Fourth message')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument()
    })

    expect(getConversationMessagesMock).toHaveBeenCalledWith(9)
    expect(getConversationMessagesMock).toHaveBeenCalledWith(9, {
      beforeId: 93,
      limit: 50,
    })
  })

  it('uses the narrower desktop and mobile history sidebar widths', async () => {
    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [],
      total: 0,
    })

    const { container } = renderChatPage(['/chat'])

    expect(await screen.findByPlaceholderText('Message Illyawish...')).toBeInTheDocument()

    const desktopSidebar = container.querySelector('aside')
    expect(desktopSidebar).not.toBeNull()
    expect(desktopSidebar?.className).toContain('w-[272px]')
    expect(desktopSidebar?.className).not.toContain('w-[320px]')

    const mobileSidebar = container.querySelector('[role="dialog"]')
    expect(mobileSidebar).not.toBeNull()
    expect(mobileSidebar?.className).toContain('w-[84vw]')
    expect(mobileSidebar?.className).toContain('max-w-[300px]')
    expect(mobileSidebar?.className).not.toContain('max-w-[320px]')
  })

  it('stops the real active conversation after switching away and restores the composer', async () => {
    const firstConversation = createConversation(1, 'First chat')
    const secondConversation = createConversation(2, 'Second chat', {
      updatedAt: '2026-03-26T10:08:00Z',
    })
    const firstMessages = [
      createMessage(11, 1, 'user', 'Earlier question'),
      createMessage(12, 1, 'assistant', 'Earlier answer'),
    ]
    const stoppedMessages = [
      ...firstMessages,
      createMessage(13, 1, 'user', 'Please keep going'),
      createMessage(14, 1, 'assistant', 'Stopped on server', {
        status: 'cancelled',
      }),
    ]
    const secondMessages = [
      createMessage(21, 2, 'assistant', 'Second conversation'),
    ]

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [secondConversation, firstConversation],
      total: 2,
    })

    let firstConversationStopped = false
    vi.spyOn(chatApi, 'getConversationMessages').mockImplementation(async (conversationId: number) => {
      if (conversationId === 1) {
        return {
          conversation: firstConversation,
          messages: firstConversationStopped ? stoppedMessages : firstMessages,
        }
      }

      return {
        conversation: secondConversation,
        messages: secondMessages,
      }
    })

    vi.spyOn(chatApi, 'streamMessage').mockImplementation(async (_conversationId, _payload, _onEvent, signal) => {
      await new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    })

    const cancelGenerationMock = vi
      .spyOn(chatApi, 'cancelGeneration')
      .mockImplementation(async (conversationId: number) => {
        firstConversationStopped = true
        expect(conversationId).toBe(1)
      })

    renderChatPage(['/chat/1'])

    await waitFor(() => {
      expect(screen.getByText('Earlier answer')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Message Illyawish...')
    fireEvent.change(textarea, { target: { value: 'Please keep going' } })

    const form = textarea.closest('form')
    if (!form) {
      throw new Error('Composer form not found')
    }

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    })

    const secondConversationButton = (await screen.findAllByRole('button', { name: 'Second chat' })).at(-1)
    if (!secondConversationButton) {
      throw new Error('Second conversation button not found')
    }

    fireEvent.click(secondConversationButton)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/2')
    })
    await waitFor(() => {
      expect(screen.getByText('Second conversation')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(cancelGenerationMock).toHaveBeenCalledWith(1)
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()

    const firstConversationButton = (await screen.findAllByRole('button', { name: 'First chat' })).at(-1)
    if (!firstConversationButton) {
      throw new Error('First conversation button not found')
    }

    fireEvent.click(firstConversationButton)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/1')
    })
    await waitFor(() => {
      expect(screen.getByText('Stopped on server')).toBeInTheDocument()
    })
  })

  it('replays a historical assistant reply from its own regenerate button', async () => {
    const conversation = createConversation(7, 'History replay')
    const initialMessages = [
      createMessage(71, 7, 'user', 'First question'),
      createMessage(72, 7, 'assistant', 'First answer'),
      createMessage(73, 7, 'user', 'Second question'),
      createMessage(74, 7, 'assistant', 'Second answer'),
    ]
    const replayedMessages = [
      createMessage(71, 7, 'user', 'First question'),
      createMessage(72, 7, 'assistant', 'Rewritten first answer'),
    ]

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })

    let useReplaySnapshot = false
    vi.spyOn(chatApi, 'getConversationMessages').mockImplementation(async () => ({
      conversation,
      messages: useReplaySnapshot ? replayedMessages : initialMessages,
    }))

    const regenerateMessageMock = vi
      .spyOn(chatApi, 'regenerateMessage')
      .mockImplementation(async (conversationId, messageId, _settings, onEvent) => {
        useReplaySnapshot = true
        await onEvent({
          type: 'done',
          message: createMessage(messageId, conversationId, 'assistant', 'Rewritten first answer'),
        })
      })

    renderChatPage(['/chat/7'])

    await waitFor(() => {
      expect(screen.getByText('Second answer')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: 'Regenerate' })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: 'Regenerate' })[0]!)

    await waitFor(() => {
      expect(regenerateMessageMock).toHaveBeenCalledWith(
        7,
        72,
        expect.anything(),
        expect.any(Function),
        expect.objectContaining({ aborted: false }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Rewritten first answer')).toBeInTheDocument()
    })
    expect(screen.queryByText('Second question')).not.toBeInTheDocument()
    expect(screen.queryByText('Second answer')).not.toBeInTheDocument()
  })

  it('resets mobile conversation actions after closing and reopening the sidebar', async () => {
    const firstConversation = createConversation(1, 'First chat')
    const secondConversation = createConversation(2, 'Second chat')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [firstConversation, secondConversation],
      total: 2,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation: firstConversation,
      messages: [createMessage(11, 1, 'assistant', 'First answer')],
    })

    renderChatPage(['/chat/1'])

    await waitFor(() => {
      expect(screen.getByText('First answer')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open conversation sidebar' }))
    const mobileSidebar = screen.getByRole('dialog', { name: 'Conversation sidebar' })
    fireEvent.click(
      within(mobileSidebar).getByRole('button', {
        name: 'More actions for First chat',
      }),
    )

    expect(within(mobileSidebar).getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close conversation sidebar' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open conversation sidebar' }))

    expect(
      within(screen.getByRole('dialog', { name: 'Conversation sidebar' })).queryByRole('button', {
        name: 'Delete',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog', { name: 'Conversation sidebar' })).getByRole('button', {
        name: 'More actions for First chat',
      }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('saves the global prompt and new-chat session prompt draft before the first message', async () => {
    const createdConversation = createConversation(5, 'Fresh chat')

    vi.spyOn(chatApi, 'getChatSettings').mockResolvedValue({
      ...createChatSettings({ globalPrompt: 'Existing global' }),
    })
    vi.spyOn(chatApi, 'listConversationsPage')
      .mockResolvedValueOnce({
        conversations: [],
        total: 0,
      })
      .mockResolvedValue({
        conversations: [createdConversation],
        total: 1,
      })

    const updateChatSettingsMock = vi
      .spyOn(chatApi, 'updateChatSettings')
      .mockResolvedValue(
        createChatSettings({ globalPrompt: 'Global instructions' }),
      )
    const createConversationMock = vi
      .spyOn(chatApi, 'createConversation')
      .mockResolvedValue(createdConversation)
    const updateConversationMock = vi
      .spyOn(chatApi, 'updateConversation')
      .mockImplementation(async (conversationId, payload) => ({
        ...createdConversation,
        id: conversationId,
        settings: payload.settings ?? createdConversation.settings,
      }))
    vi.spyOn(chatApi, 'streamMessage').mockImplementation(async (conversationId, _payload, onEvent) => {
      await onEvent({
        type: 'done',
        message: createMessage(52, conversationId, 'assistant', 'Hi there'),
      })
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation: createdConversation,
      messages: [
        createMessage(51, 5, 'user', 'Hello from test'),
        createMessage(52, 5, 'assistant', 'Hi there'),
      ],
    })

    renderChatPage(['/chat'])

    expect(await screen.findByPlaceholderText('Message Illyawish...')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    fireEvent.change(await screen.findByLabelText('Global prompt'), {
      target: { value: 'Global instructions' },
    })
    fireEvent.change(screen.getByLabelText('Session prompt'), {
      target: { value: 'Draft session prompt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(updateChatSettingsMock).toHaveBeenCalledWith({
        globalPrompt: 'Global instructions',
        model: '',
        temperature: 1,
        maxTokens: null,
        contextWindowTurns: null,
      })
    })

    const textarea = screen.getByPlaceholderText('Message Illyawish...')
    fireEvent.change(textarea, { target: { value: 'Hello from test' } })

    const form = textarea.closest('form')
    if (!form) {
      throw new Error('Composer form not found')
    }

    fireEvent.submit(form)

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith(5, {
        settings: expect.objectContaining({
          systemPrompt: 'Draft session prompt',
        }),
      })
    })
  })

  it('saves the global prompt and current conversation session prompt together', async () => {
    const conversation = createConversation(9, 'Session settings test')

    vi.spyOn(chatApi, 'getChatSettings').mockResolvedValue({
      ...createChatSettings({ globalPrompt: 'Existing global' }),
    })
    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages: [createMessage(91, 9, 'assistant', 'Visible message')],
    })
    const updateChatSettingsMock = vi
      .spyOn(chatApi, 'updateChatSettings')
      .mockResolvedValue(
        createChatSettings({ globalPrompt: 'Updated global prompt' }),
      )
    const updateConversationMock = vi
      .spyOn(chatApi, 'updateConversation')
      .mockImplementation(async (conversationId, payload) => ({
        ...conversation,
        id: conversationId,
        settings: payload.settings ?? conversation.settings,
      }))

    renderChatPage(['/chat/9'])

    await waitFor(() => {
      expect(screen.getByText('Visible message')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    fireEvent.change(await screen.findByLabelText('Global prompt'), {
      target: { value: 'Updated global prompt' },
    })
    fireEvent.change(screen.getByLabelText('Session prompt'), {
      target: { value: 'Conversation-only prompt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(updateChatSettingsMock).toHaveBeenCalledWith({
        globalPrompt: 'Updated global prompt',
        model: '',
        temperature: 1,
        maxTokens: null,
        contextWindowTurns: null,
      })
    })
    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith(9, {
        settings: expect.objectContaining({
          systemPrompt: 'Conversation-only prompt',
        }),
      })
    })
  })

  it('saves folder and tags together with conversation settings', async () => {
    const conversation = createConversation(9, 'Organized chat')

    vi.spyOn(chatApi, 'getChatSettings').mockResolvedValue({
      ...createChatSettings({ globalPrompt: 'Existing global' }),
    })
    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages: [createMessage(91, 9, 'assistant', 'Visible message')],
      pagination: {
        hasMore: false,
        nextBeforeId: null,
      },
    })
    vi.spyOn(chatApi, 'updateChatSettings').mockResolvedValue(
      createChatSettings({ globalPrompt: 'Updated global prompt' }),
    )
    const updateConversationMock = vi
      .spyOn(chatApi, 'updateConversation')
      .mockImplementation(async (conversationId, payload) => ({
        ...conversation,
        id: conversationId,
        folder: payload.folder ?? conversation.folder,
        tags: payload.tags ?? conversation.tags,
        settings: payload.settings ?? conversation.settings,
      }))

    renderChatPage(['/chat/9'])

    await waitFor(() => {
      expect(screen.getByText('Visible message')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    fireEvent.change(await screen.findByLabelText('Folder'), {
      target: { value: 'Work' },
    })
    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'urgent, planning' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith(9, {
        folder: 'Work',
        tags: ['urgent', 'planning'],
        settings: expect.objectContaining({
          systemPrompt: '',
        }),
      })
    })
  })
})
