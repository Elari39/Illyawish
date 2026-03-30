import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../components/auth/auth-context'
import { APP_LOCALE_STORAGE_KEY } from '../i18n/config'
import { I18nProvider } from '../i18n/provider'
import { chatApi } from '../lib/api'
import { ChatPage } from './chat-page'
import { LAST_CONVERSATION_STORAGE_KEY } from './chat-page/types'
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

function createConversation(
  id: string,
  title: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: id as unknown as Conversation['id'],
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
  conversationId: string,
  role: Message['role'],
  content: string,
): Message {
  return {
    id,
    conversationId: conversationId as unknown as Message['conversationId'],
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
            <Route path="/chat/s/:conversationId" element={<RouteShell />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ChatPage UUID conversation routes', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'en-US')
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(chatApi, 'getChatSettings').mockResolvedValue(createChatSettings())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps /chat on the hero state even when a last conversation UUID is stored', async () => {
    const conversationID = '8e84849b-6ead-49c1-b240-4442f603b5df'
    const conversation = createConversation(conversationID, 'Resume me')

    window.localStorage.setItem(LAST_CONVERSATION_STORAGE_KEY, conversationID)

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    const getConversationMessagesMock = vi.spyOn(chatApi, 'getConversationMessages')

    renderChatPage(['/chat'])

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'How can I help you today?' })).toBeInTheDocument()
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/chat')
    expect(getConversationMessagesMock).not.toHaveBeenCalled()
  })

  it('loads a UUID conversation directly from /chat/s/:conversationId', async () => {
    const conversationID = '69e1f1b4-d69f-4d65-b47f-1989e89fe72d'
    const conversation = createConversation(conversationID, 'Direct open')

    vi.spyOn(chatApi, 'listConversationsPage').mockResolvedValue({
      conversations: [conversation],
      total: 1,
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockImplementation(async (conversationId) => {
      expect(conversationId).toBe(conversationID)
      return {
        conversation,
        messages: [createMessage(11, conversationID, 'assistant', 'Loaded direct conversation')],
      }
    })

    renderChatPage([`/chat/s/${conversationID}`])

    await waitFor(() => {
      expect(screen.getByText('Loaded direct conversation')).toBeInTheDocument()
    })
    expect(screen.getByTestId('location')).toHaveTextContent(`/chat/s/${conversationID}`)
  })

  it('navigates to the UUID route after creating the first conversation', async () => {
    const conversationID = '23b6b95d-a42c-43f3-bb62-58c15dbba0d5'
    const createdConversation = createConversation(conversationID, 'Fresh chat')

    vi.spyOn(chatApi, 'listConversationsPage')
      .mockResolvedValueOnce({
        conversations: [],
        total: 0,
      })
      .mockResolvedValue({
        conversations: [createdConversation],
        total: 1,
      })
    vi.spyOn(chatApi, 'createConversation').mockResolvedValue(createdConversation)
    vi.spyOn(chatApi, 'streamMessage').mockImplementation(async (_conversationId, _payload, onEvent) => {
      await onEvent({
        type: 'done',
        message: createMessage(52, conversationID, 'assistant', 'Hi there'),
      })
    })
    vi.spyOn(chatApi, 'getConversationMessages').mockResolvedValue({
      conversation: createdConversation,
      messages: [
        createMessage(51, conversationID, 'user', 'Hello from test'),
        createMessage(52, conversationID, 'assistant', 'Hi there'),
      ],
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
      expect(screen.getByTestId('location')).toHaveTextContent(`/chat/s/${conversationID}`)
    })
  })
})
