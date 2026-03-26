import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Conversation, ConversationSettings } from '../../../types/chat'
import { TestProviders } from '../../../test/test-providers'
import { SidebarContent } from './sidebar-content'

const defaultSettings: ConversationSettings = {
  systemPrompt: 'You are a helpful assistant.',
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
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

function renderSidebarContent() {
  const conversations = [
    createConversation(1, 'First mobile chat'),
    createConversation(2, 'Second mobile chat'),
  ]

  const handlers = {
    onSearchChange: vi.fn(),
    onToggleArchived: vi.fn(),
    onLoadMore: vi.fn(),
    onSelectConversation: vi.fn(),
    onRenameConversation: vi.fn(),
    onTogglePinned: vi.fn(),
    onToggleArchivedConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onCreateChat: vi.fn(),
    onLogout: vi.fn(),
  }

  render(
    <TestProviders>
      <SidebarContent
        collapsed={false}
        variant="mobile"
        currentConversationId={1}
        conversations={conversations}
        hasMoreConversations={false}
        searchValue=""
        showArchived={false}
        isLoading={false}
        isLoadingMore={false}
        username="Elaina"
        {...handlers}
      />
    </TestProviders>,
  )

  return { conversations, handlers }
}

describe('SidebarContent mobile actions', () => {
  it('shows a touch-friendly action trigger for each mobile conversation', () => {
    const { conversations } = renderSidebarContent()

    for (const conversation of conversations) {
      expect(
        screen.getByRole('button', {
          name: `More actions for ${conversation.title}`,
        }),
      ).toBeInTheDocument()
    }
  })

  it('toggles only one mobile action panel at a time', () => {
    const { conversations } = renderSidebarContent()

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: `Hide actions for ${conversations[0]!.title}`,
      }),
    ).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[1]!.title}`,
      }),
    )

    expect(
      screen.queryByRole('button', {
        name: `Hide actions for ${conversations[0]!.title}`,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: `Hide actions for ${conversations[1]!.title}`,
      }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not navigate when opening mobile actions and forwards the selected action callback', () => {
    const { conversations, handlers } = renderSidebarContent()

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    expect(handlers.onSelectConversation).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pin' }))

    expect(handlers.onTogglePinned).toHaveBeenCalledWith(conversations[0])
    expect(
      screen.queryByRole('button', {
        name: `Hide actions for ${conversations[0]!.title}`,
      }),
    ).not.toBeInTheDocument()
  })

  it('closes the expanded mobile actions when the conversation list changes', () => {
    const conversations = [
      createConversation(1, 'First mobile chat'),
      createConversation(2, 'Second mobile chat'),
    ]

    const handlers = {
      onSearchChange: vi.fn(),
      onToggleArchived: vi.fn(),
      onLoadMore: vi.fn(),
      onSelectConversation: vi.fn(),
      onRenameConversation: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleArchivedConversation: vi.fn(),
      onDeleteConversation: vi.fn(),
      onCreateChat: vi.fn(),
      onLogout: vi.fn(),
    }

    const { rerender } = render(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="mobile"
          currentConversationId={1}
          conversations={conversations}
          hasMoreConversations={false}
          searchValue=""
          showArchived={false}
          isLoading={false}
          isLoadingMore={false}
          username="Elaina"
          {...handlers}
        />
      </TestProviders>,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    expect(
      screen.getByRole('button', {
        name: `Hide actions for ${conversations[0]!.title}`,
      }),
    ).toBeInTheDocument()

    rerender(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="mobile"
          currentConversationId={2}
          conversations={[conversations[1]!]}
          hasMoreConversations={false}
          searchValue=""
          showArchived={false}
          isLoading={false}
          isLoadingMore={false}
          username="Elaina"
          {...handlers}
        />
      </TestProviders>,
    )

    expect(
      screen.queryByRole('button', {
        name: `Hide actions for ${conversations[0]!.title}`,
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('closes the expanded mobile actions after selecting a conversation', () => {
    const { conversations, handlers } = renderSidebarContent()

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: conversations[0]!.title,
      }),
    )

    expect(handlers.onSelectConversation).toHaveBeenCalledWith(conversations[0]!.id)
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
