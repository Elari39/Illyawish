import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../components/auth/auth-context'
import { I18nProvider } from '../i18n/provider'
import { APP_LOCALE_STORAGE_KEY } from '../i18n/config'
import { chatApi } from '../lib/api'
import { LAST_CONVERSATION_STORAGE_KEY } from './chat-page/types'
import { ChatPage } from './chat-page'
import type { Conversation, ConversationSettings, Message } from '../types/chat'

const defaultSettings: ConversationSettings = {
  systemPrompt: 'You are a helpful assistant.',
  model: '',
  temperature: 1,
  maxTokens: null,
}

const authValue: AuthContextValue = {
  user: {
    id: 1,
    username: 'Elaina',
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
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    attachments: [],
    status: 'completed',
    createdAt: '2026-03-26T09:08:00Z',
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
})
