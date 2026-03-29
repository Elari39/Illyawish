import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../components/auth/auth-context'
import { I18nProvider } from '../i18n/provider'
import { APP_LOCALE_STORAGE_KEY } from '../i18n/config'
import { AUTH_UNAUTHORIZED_EVENT, agentApi, chatApi, providerApi, ragApi, workflowApi } from '../lib/api'
import { LAST_CONVERSATION_STORAGE_KEY } from './chat-page/types'
import { ChatPage } from './chat-page'
import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
  Message,
} from '../types/chat'
import { buildExecutionPanelStorageKey } from './chat-page/execution-panel-storage'

const defaultSettings: ConversationSettings = {
  systemPrompt: '',
  providerPresetId: null,
  model: '',
  temperature: null,
  maxTokens: null,
  contextWindowTurns: null,
}

function createChatSettings(
  overrides: Partial<ChatSettings> = {},
): ChatSettings {
  return {
    globalPrompt: '',
    providerPresetId: null,
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

const clipboardWriteText = vi.fn<(_: string) => Promise<void>>()

function createConversation(
  id: number | string,
  title: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: String(id) as Conversation['id'],
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
  conversationId: number | string,
  role: Message['role'],
  content: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: String(conversationId) as Message['conversationId'],
    role,
    content,
    attachments: [],
    status: 'completed',
    createdAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

function chatPath(id: number | string) {
  return `/chat/s/${id}`
}

function createWorkflowPreset(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    userId: 1,
    name: 'Knowledge Q&A',
    templateKey: 'knowledge_qa',
    defaultInputs: {},
    knowledgeSpaceIds: [],
    toolEnablements: {},
    outputMode: 'markdown',
    createdAt: '2026-03-26T09:08:00Z',
    updatedAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

function createWorkflowTemplate(overrides: Record<string, unknown> = {}) {
  return {
    key: 'knowledge_qa',
    name: 'Knowledge Q&A',
    description: 'Answer questions from knowledge spaces.',
    nodes: [],
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
            <Route path="/chat/s/:conversationId" element={<RouteShell />} />
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
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    })
    clipboardWriteText.mockReset()
    clipboardWriteText.mockResolvedValue(undefined)
    vi.spyOn(chatApi, 'getChatSettings').mockResolvedValue({
      ...createChatSettings(),
    })
    vi.spyOn(providerApi, 'list').mockResolvedValue({
      presets: [],
      activePresetId: null,
      currentSource: 'none',
      fallback: {
        available: false,
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    })
    vi.spyOn(ragApi, 'getProviders').mockResolvedValue({
      presets: [],
      activePresetId: null,
      currentSource: 'none',
      fallback: {
        available: false,
        name: '',
        baseURL: '',
        embeddingModel: '',
        rerankerModel: '',
      },
    })
    vi.spyOn(ragApi, 'listKnowledgeSpaces').mockResolvedValue([])
    vi.spyOn(workflowApi, 'listTemplates').mockResolvedValue([])
    vi.spyOn(workflowApi, 'listPresets').mockResolvedValue([])
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
      expect(screen.getByTestId('location')).toHaveTextContent(chatPath(7))
    })

    await waitFor(() => {
      expect(screen.getByText('Welcome back')).toBeInTheDocument()
    })

    expect(getConversationMessagesMock).toHaveBeenCalledTimes(1)
    expect(getConversationMessagesMock).toHaveBeenCalledWith('7')
    expect(screen.queryByText('Loading conversation...')).not.toBeInTheDocument()
  })

  it('renders a centered hero state on a fresh chat route', async () => {
    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [],
      total: 0,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation: createConversation(1, 'Unused'),
      messages: [],
    })

    renderChatPage(['/chat'])

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'How can I help you today?' })).toBeInTheDocument()
    })

    expect(screen.getByTestId('chat-composer')).toHaveAttribute('data-layout', 'hero')
    expect(screen.getByTestId('chat-header-site-name')).toHaveTextContent('Illyawish')
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument()
    expect(screen.queryByTestId('chat-header-title')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Select a conversation from the sidebar, or start a new chat below.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue last conversation' }),
    ).not.toBeInTheDocument()
  })

  it('shows the conversation title in the top center once a chat is open', async () => {
    const activeConversation = createConversation(3, 'Centered title chat')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [activeConversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation: activeConversation,
      messages: [createMessage(31, 3, 'assistant', 'Loaded message')],
    })

    renderChatPage([chatPath(3)])

    await waitFor(() => {
      expect(screen.getByText('Loaded message')).toBeInTheDocument()
    })

    expect(screen.getByTestId('chat-composer')).toHaveAttribute('data-layout', 'docked')
    expect(screen.getByTestId('chat-header-site-name')).toHaveTextContent('Illyawish')
    expect(screen.getByTestId('chat-header-title')).toHaveTextContent('Centered title chat')
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument()
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
      .mockImplementation(async (conversationId) => ({
        conversation: conversationId === '1' ? firstConversation : secondConversation,
        messages: [
          createMessage(
            Number(conversationId) * 10,
            conversationId,
            'assistant',
            conversationId === '1' ? 'Loaded first conversation' : 'Loaded second conversation',
          ),
        ],
      }))

    renderChatPage([chatPath(1)])

    await waitFor(() => {
      expect(screen.getByText('Loaded first conversation')).toBeInTheDocument()
    })

    const historyButtons = await screen.findAllByRole('button', { name: 'Second chat' })
    fireEvent.click(historyButtons[historyButtons.length - 1]!)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(chatPath(2))
    })

    await waitFor(() => {
      expect(screen.getByText('Loaded second conversation')).toBeInTheDocument()
    })

    expect(listConversationsPageMock).toHaveBeenCalledTimes(1)
    expect(
      getConversationMessagesMock.mock.calls.filter(([conversationId]) => conversationId === '2'),
    ).toHaveLength(1)
  })

  it('uses the desktop sidebar header as the only desktop collapse toggle', async () => {
    const firstConversation = createConversation(1, 'First chat')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [firstConversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation: firstConversation,
      messages: [createMessage(11, 1, 'assistant', 'Loaded')],
    })

    renderChatPage([chatPath(1)])

    const collapseButtons = await screen.findAllByRole('button', {
      name: 'Collapse conversation sidebar',
    })

    expect(collapseButtons).toHaveLength(1)

    await act(async () => {
      fireEvent.click(collapseButtons[0]!)
    })

    expect(screen.getByRole('button', { name: 'Expand conversation sidebar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'First chat' })).not.toBeInTheDocument()
  })

  it('does not switch conversations while a reply is streaming', async () => {
    const firstConversation = createConversation(1, 'First chat')
    const secondConversation = createConversation(2, 'Second chat', {
      updatedAt: '2026-03-26T10:08:00Z',
    })

    let resolveStream: (() => void) | null = null

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [secondConversation, firstConversation],
      total: 2,
    })
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockImplementation(async (conversationId) => ({
        conversation: conversationId === '1' ? firstConversation : secondConversation,
        messages: [
          createMessage(
            Number(conversationId) * 10,
            conversationId,
            'assistant',
            conversationId === '1' ? 'Loaded first conversation' : 'Loaded second conversation',
          ),
        ],
      }))
    vi.spyOn(chatApi, 'streamMessage').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStream = resolve
        }),
    )

    renderChatPage([chatPath(1)])

    await waitFor(() => {
      expect(screen.getByText('Loaded first conversation')).toBeInTheDocument()
    })

    const textarea = await screen.findByPlaceholderText('Message Illyawish...')
    fireEvent.change(textarea, { target: { value: 'Still streaming' } })

    const form = textarea.closest('form')
    if (!form) {
      throw new Error('Composer form not found')
    }

    fireEvent.submit(form)

    await waitFor(() => {
      expect(chatApi.streamMessage).toHaveBeenCalledTimes(1)
    })

    const historyButtons = await screen.findAllByRole('button', { name: 'Second chat' })
    fireEvent.click(historyButtons[historyButtons.length - 1]!)

    expect(screen.getByTestId('location')).toHaveTextContent(chatPath(1))
    expect(
      getConversationMessagesMock.mock.calls.filter(([conversationId]) => conversationId === '2'),
    ).toHaveLength(0)

    await act(async () => {
      resolveStream?.()
    })
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
      expect(screen.getByTestId('location')).toHaveTextContent(chatPath(5))
    })

    await waitFor(() => {
      expect(screen.getByText('Hi there')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('chat-header-title')).toHaveTextContent('Fresh chat')
    })

    expect(createConversationMock).toHaveBeenCalledTimes(1)
    expect(createConversationMock).toHaveBeenCalledWith({
      workflowPresetId: null,
      knowledgeSpaceIds: [],
      settings: {
        ...defaultSettings,
      },
    })
    expect(streamMessageMock).toHaveBeenCalledTimes(1)
    expect(
      getConversationMessagesMock.mock.calls.filter(([conversationId]) => conversationId === '5'),
    ).toHaveLength(2)
  })

  it('deletes a newly created empty conversation when the first send fails before any messages persist', async () => {
    const createdConversation = createConversation(5, 'Fresh chat')

    vi.spyOn(chatApi, 'listConversationsPage')
      .mockResolvedValueOnce({
        conversations: [],
        total: 0,
      })
      .mockResolvedValue({
        conversations: [],
        total: 0,
      })

    const createConversationMock = vi
      .spyOn(chatApi, 'createConversation')
      .mockResolvedValue(createdConversation)
    const deleteConversationMock = vi
      .spyOn(chatApi, 'deleteConversation')
      .mockResolvedValue(undefined)
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockResolvedValue({
        conversation: createdConversation,
        messages: [],
      })
    vi.spyOn(chatApi, 'streamMessage')
      .mockRejectedValue(new Error('provider unavailable'))

    renderChatPage(['/chat'])

    const textarea = await screen.findByPlaceholderText('Message Illyawish...')
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
      expect(getConversationMessagesMock).toHaveBeenCalledWith('5')
    })
    await waitFor(() => {
      expect(deleteConversationMock).toHaveBeenCalledWith('5')
    })
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/chat')
    })
    expect(await screen.findByText('provider unavailable')).toBeInTheDocument()
  })

  it('preserves a newly created conversation when the failed first send already persisted messages', async () => {
    const createdConversation = createConversation(5, 'Fresh chat')

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
    const deleteConversationMock = vi
      .spyOn(chatApi, 'deleteConversation')
      .mockResolvedValue(undefined)
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockResolvedValue({
        conversation: createdConversation,
        messages: [
          createMessage(51, 5, 'user', 'Hello from test'),
        ],
      })
    vi.spyOn(chatApi, 'streamMessage')
      .mockRejectedValue(new Error('provider unavailable'))

    renderChatPage(['/chat'])

    const textarea = await screen.findByPlaceholderText('Message Illyawish...')
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
      expect(getConversationMessagesMock).toHaveBeenCalledWith('5')
    })
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(chatPath(5))
    })
    expect(deleteConversationMock).not.toHaveBeenCalled()
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

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Visible message')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Language' })).not.toBeInTheDocument()

    const settingsButtons = screen.getAllByRole('button', { name: 'Settings' })
    fireEvent.click(settingsButtons[settingsButtons.length - 1]!)

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
                id: '9',
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
              id: '9',
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

    renderChatPage([chatPath(9)])

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

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Reply two')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Regenerate' })).toHaveLength(2)
  })

  it('copies message content from the conversation view', async () => {
    const conversation = createConversation(9, 'Copy controls')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages: [
        createMessage(91, 9, 'user', 'Question to copy'),
        createMessage(92, 9, 'assistant', 'Reply to copy'),
      ],
    })

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Reply to copy')).toBeInTheDocument()
    })

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' })
    expect(copyButtons).toHaveLength(2)

    fireEvent.click(copyButtons[1]!)

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('Reply to copy')
    })
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
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
      .mockImplementation(async (_conversationId, params?: { beforeId?: number; limit?: number }) => {
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

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Fourth message')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument()
    })

    expect(getConversationMessagesMock).toHaveBeenCalledWith('9')
    expect(getConversationMessagesMock).toHaveBeenCalledWith('9', {
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

  it('stops the active conversation and restores the composer without switching away', async () => {
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
    vi.spyOn(chatApi, 'getConversationMessages').mockImplementation(async (conversationId) => {
      if (conversationId === '1') {
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
      .mockImplementation(async (conversationId) => {
        firstConversationStopped = true
        expect(conversationId).toBe('1')
      })

    renderChatPage([chatPath(1)])

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

    expect(secondConversationButton).toBeDisabled()

    fireEvent.click(secondConversationButton)

    expect(screen.getByTestId('location')).toHaveTextContent(chatPath(1))
    expect(screen.queryByText('Second conversation')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(cancelGenerationMock).toHaveBeenCalledWith('1')
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()

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

    renderChatPage([chatPath(7)])

    await waitFor(() => {
      expect(screen.getByText('Second answer')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: 'Regenerate' })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: 'Regenerate' })[0]!)

    await waitFor(() => {
      expect(regenerateMessageMock).toHaveBeenCalledWith(
        '7',
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

    renderChatPage([chatPath(1)])

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
        providerPresetId: null,
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
      expect(createConversationMock).toHaveBeenCalledWith(expect.objectContaining({
        workflowPresetId: null,
        knowledgeSpaceIds: [],
        settings: {
          ...defaultSettings,
          systemPrompt: 'Draft session prompt',
        },
      }))
    })
  })

  it('renders streamed assistant deltas before the done event and preserves the final content', async () => {
    const conversation = createConversation(5, 'Fresh chat')
    const initialMessages = [
      createMessage(51, 5, 'assistant', 'Earlier reply'),
    ]
    const finalMessages = [
      ...initialMessages,
      createMessage(53, 5, 'user', 'Hello from test'),
      createMessage(52, 5, 'assistant', 'Hello there'),
    ]

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    let resolveDone: (() => void) | null = null
    vi.spyOn(chatApi, 'streamMessage').mockImplementation(async (conversationId, _payload, onEvent) => {
      await onEvent({
        type: 'message_start',
        message: createMessage(52, conversationId, 'assistant', '', {
          status: 'streaming',
        }),
      })
      await onEvent({
        type: 'delta',
        content: 'Hello',
      })
      await onEvent({
        type: 'message_delta',
        content: ' there',
      })

      await new Promise<void>((resolve) => {
        resolveDone = () => {
          void Promise.resolve(onEvent({
            type: 'done',
            message: createMessage(52, conversationId, 'assistant', 'Hello there'),
          })).then(resolve)
        }
      })
    })
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockResolvedValueOnce({
        conversation,
        messages: initialMessages,
      })
      .mockResolvedValue({
        conversation,
        messages: finalMessages,
      })

    renderChatPage([chatPath(5)])

    const textarea = await screen.findByPlaceholderText('Message Illyawish...')
    fireEvent.change(textarea, { target: { value: 'Hello from test' } })

    const form = textarea.closest('form')
    if (!form) {
      throw new Error('Composer form not found')
    }

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getAllByText('Hello there')).toHaveLength(1)
    })

    await act(async () => {
      resolveDone?.()
    })

    await waitFor(() => {
      expect(screen.getAllByText('Hello there')).toHaveLength(1)
    })
    expect(getConversationMessagesMock).toHaveBeenCalledWith('5')
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

    renderChatPage([chatPath(9)])

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
        providerPresetId: null,
        model: '',
        temperature: 1,
        maxTokens: null,
        contextWindowTurns: null,
      })
    })
    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith('9', expect.objectContaining({
        workflowPresetId: null,
        settings: {
          ...defaultSettings,
          systemPrompt: 'Conversation-only prompt',
        },
      }))
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

    renderChatPage([chatPath(9)])

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
      expect(updateConversationMock).toHaveBeenCalledWith('9', expect.objectContaining({
        folder: 'Work',
        tags: ['urgent', 'planning'],
        workflowPresetId: null,
        settings: {
          ...defaultSettings,
          systemPrompt: '',
        },
      }))
    })
  })

  it('shows the top context bar and updates the current conversation provider-model immediately', async () => {
    const conversation = createConversation(9, 'Context bar chat', {
      workflowPresetId: 5,
      knowledgeSpaceIds: [11, 12],
      settings: {
        ...defaultSettings,
        providerPresetId: 7,
        model: 'gpt-4.1-mini',
      },
    })

    vi.spyOn(chatApi, 'getChatSettings').mockResolvedValue(
      createChatSettings({
        providerPresetId: 7,
        model: 'gpt-4.1-mini',
      }),
    )
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
    vi.spyOn(providerApi, 'list').mockResolvedValue({
      presets: [
        {
          id: 13,
          name: 'Anthropic',
          baseURL: 'https://api.anthropic.com/v1',
          hasApiKey: true,
          apiKeyHint: 'sk-ant-***',
          models: ['claude-3.7-sonnet'],
          defaultModel: 'claude-3.7-sonnet',
          isActive: false,
          createdAt: '2026-03-26T00:00:00Z',
          updatedAt: '2026-03-26T00:00:00Z',
        },
        {
          id: 7,
          name: 'OpenAI',
          baseURL: 'https://api.openai.com/v1',
          hasApiKey: true,
          apiKeyHint: 'sk-***',
          models: ['gpt-4.1-mini'],
          defaultModel: 'gpt-4.1-mini',
          isActive: true,
          createdAt: '2026-03-26T00:00:00Z',
          updatedAt: '2026-03-26T00:00:00Z',
        },
      ],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: {
        available: false,
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    })
    vi.spyOn(ragApi, 'listKnowledgeSpaces').mockResolvedValue([
      {
        id: 11,
        userId: 1,
        name: 'Engineering',
        description: 'Specs',
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-26T00:00:00Z',
      },
      {
        id: 12,
        userId: 1,
        name: 'Support',
        description: 'FAQ',
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-26T00:00:00Z',
      },
    ])
    vi.spyOn(workflowApi, 'listPresets').mockResolvedValue([
      {
        id: 5,
        userId: 1,
        name: 'Knowledge Q&A',
        templateKey: 'knowledge_qa',
        defaultInputs: {},
        knowledgeSpaceIds: [11, 12],
        toolEnablements: {},
        outputMode: 'markdown',
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-26T00:00:00Z',
      },
    ])
    const updateConversationMock = vi
      .spyOn(chatApi, 'updateConversation')
      .mockImplementation(async (conversationId, payload) => ({
        ...conversation,
        id: conversationId,
        settings: {
          ...conversation.settings,
          ...payload.settings,
        },
      }))

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Visible message')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Provider and model'), {
      target: { value: '13::claude-3.7-sonnet' },
    })

    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith(
        '9',
        expect.objectContaining({
          settings: expect.objectContaining({
            providerPresetId: 13,
            model: 'claude-3.7-sonnet',
          }),
        }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))

    expect(screen.getByRole('menuitem', { name: 'KnowledgeKnowledge enabled · 2 spaces' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'WorkflowWorkflow enabled · Knowledge Q&A' })).toBeInTheDocument()
  })

  it('preserves the current conversation provider-model when saving session settings', async () => {
    const conversation = createConversation(9, 'Context-preserving chat', {
      settings: {
        ...defaultSettings,
        providerPresetId: 13,
        model: 'claude-3.7-sonnet',
      },
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
      createChatSettings(),
    )
    const updateConversationMock = vi
      .spyOn(chatApi, 'updateConversation')
      .mockImplementation(async (conversationId, payload) => ({
        ...conversation,
        id: conversationId,
        settings: {
          ...conversation.settings,
          ...payload.settings,
        },
      }))

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Visible message')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.change(await screen.findByLabelText('Session prompt'), {
      target: { value: 'Keep provider selection' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith('9', expect.objectContaining({
        workflowPresetId: null,
        settings: {
          ...defaultSettings,
          providerPresetId: 13,
          model: 'claude-3.7-sonnet',
          systemPrompt: 'Keep provider selection',
        },
      }))
    })
  })

  it('clears the current conversation workflow preset after deleting that preset', async () => {
    const workflowPreset = createWorkflowPreset()
    const conversation = createConversation(9, 'Workflow chat', {
      workflowPresetId: Number(workflowPreset.id),
    })

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages: [createMessage(91, 9, 'assistant', 'Workflow reply')],
    })
    vi.spyOn(workflowApi, 'listTemplates').mockResolvedValue([
      createWorkflowTemplate(),
    ])
    vi.spyOn(workflowApi, 'listPresets').mockResolvedValue([
      workflowPreset,
    ])
    const deletePresetMock = vi
      .spyOn(workflowApi, 'deletePreset')
      .mockResolvedValue(undefined)
    const updateConversationMock = vi
      .spyOn(chatApi, 'updateConversation')
      .mockResolvedValue(createConversation(9, 'Workflow chat', {
        workflowPresetId: null,
      }))

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Workflow reply')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const settingsDialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(await within(settingsDialog).findByRole('button', { name: 'Workflow' }))
    fireEvent.click(await within(settingsDialog).findByRole('button', { name: 'Delete preset Knowledge Q&A' }))

    const confirmationDialogs = await screen.findAllByRole('dialog')
    const confirmationDialog = confirmationDialogs[confirmationDialogs.length - 1]
    if (!confirmationDialog) {
      throw new Error('Confirmation dialog not found')
    }
    fireEvent.click(within(confirmationDialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(deletePresetMock).toHaveBeenCalledWith(5)
    })
    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith('9', {
        workflowPresetId: null,
      })
    })
  })

  it('renders execution state inside the latest assistant message instead of above the message list', async () => {
    const conversation = createConversation(9, 'Knowledge run')
    const messages = [
      createMessage(91, 9, 'user', 'What is Viper?'),
      createMessage(92, 9, 'assistant', 'Viper is a Go configuration library.'),
    ]

    window.sessionStorage.setItem(
      buildExecutionPanelStorageKey('9'),
      JSON.stringify({
        events: [
          {
            type: 'run_started',
            metadata: {
              templateKey: 'knowledge_qa',
            },
          },
          {
            type: 'workflow_step_started',
            stepName: 'question',
            metadata: {
              stepIndex: 0,
            },
          },
          {
            type: 'workflow_step_completed',
            stepName: 'question',
            metadata: {
              stepIndex: 0,
            },
          },
          {
            type: 'workflow_step_started',
            stepName: 'retrieve_knowledge',
            metadata: {
              stepIndex: 1,
            },
          },
          {
            type: 'workflow_step_completed',
            stepName: 'retrieve_knowledge',
            metadata: {
              stepIndex: 1,
            },
          },
          {
            type: 'done',
          },
        ],
        pendingConfirmationId: null,
      }),
    )

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages,
    })

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Viper is a Go configuration library.')).toBeInTheDocument()
    })

    expect(screen.queryByText('Execution progress')).not.toBeInTheDocument()
    expect(screen.getByText('Knowledge Q&A')).toBeInTheDocument()
    expect(screen.getByText('2/2 steps')).toBeInTheDocument()
  })

  it('clears persisted tool confirmation state after approving and does not restore it on remount', async () => {
    const conversation = createConversation(9, 'Knowledge run')
    const messages = [
      createMessage(91, 9, 'user', 'Run a tool'),
      createMessage(92, 9, 'assistant', 'Working on it', {
        status: 'streaming',
      }),
    ]

    window.sessionStorage.setItem(
      buildExecutionPanelStorageKey('9'),
      JSON.stringify({
        events: [
          {
            type: 'run_started',
            metadata: {
              templateKey: 'knowledge_qa',
            },
          },
          {
            type: 'workflow_step_started',
            stepName: 'run_tool',
            metadata: {
              stepIndex: 0,
            },
          },
          {
            type: 'tool_call_started',
            toolName: 'web_search',
          },
          {
            type: 'tool_call_confirmation_required',
            toolName: 'web_search',
            confirmationId: 'confirm-1',
            metadata: {
              confirmationLabel: 'Allow this tool call?',
            },
          },
        ],
        pendingConfirmationId: 'confirm-1',
      }),
    )

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation,
      messages,
    })
    const confirmToolCallMock = vi
      .spyOn(agentApi, 'confirmToolCall')
      .mockResolvedValue({ ok: true })

    const view = renderChatPage([chatPath(9)])

    const approveButton = await screen.findByRole('button', { name: 'Approve' })
    fireEvent.click(approveButton)

    await waitFor(() => {
      expect(confirmToolCallMock).toHaveBeenCalledWith('confirm-1', true)
    })
    await waitFor(() => {
      expect(
        JSON.parse(
          window.sessionStorage.getItem(buildExecutionPanelStorageKey('9')) ?? 'null',
        ),
      ).toMatchObject({
        pendingConfirmationId: null,
      })
    })

    view.unmount()

    renderChatPage([chatPath(9)])

    await waitFor(() => {
      expect(screen.getByText('Working on it')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByText('Allow this tool call?')).not.toBeInTheDocument()
  })
})
