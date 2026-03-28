import { fireEvent, render, screen, within } from '@testing-library/react'
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

function createHandlers() {
  return {
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
}

function renderSidebarContent(variant: 'mobile' | 'desktop' = 'mobile') {
  const conversations = [
    createConversation(1, 'First mobile chat'),
    createConversation(2, 'Second mobile chat'),
  ]

  const handlers = createHandlers()

  render(
    <TestProviders>
      <SidebarContent
        collapsed={false}
        variant={variant}
        interactionDisabled={false}
        currentConversationId="1"
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

    const handlers = createHandlers()

    const { rerender } = render(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="mobile"
          currentConversationId="1"
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
          currentConversationId="2"
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

  it('disables mobile conversation interactions while a reply is streaming', () => {
    const conversations = [
      createConversation(1, 'First mobile chat'),
      createConversation(2, 'Second mobile chat'),
    ]
    const handlers = createHandlers()

    render(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="mobile"
          interactionDisabled
          currentConversationId="1"
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

    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: conversations[0]!.title,
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: conversations[0]!.title,
      }),
    )

    expect(handlers.onCreateChat).not.toHaveBeenCalled()
    expect(handlers.onSelectConversation).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

describe('SidebarContent desktop actions', () => {
  it('does not render inline action buttons before opening the menu', () => {
    renderSidebarContent('desktop')

    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('opens only one desktop menu at a time and closes after choosing an action', () => {
    const { conversations, handlers } = renderSidebarContent('desktop')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[1]!.title}`,
      }),
    )

    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))

    expect(handlers.onTogglePinned).toHaveBeenCalledWith(conversations[1])
    expect(screen.queryByRole('menuitem', { name: 'Pin' })).not.toBeInTheDocument()
  })

  it('exposes desktop menu semantics and focuses the trigger again after escape', () => {
    const { conversations } = renderSidebarContent('desktop')

    const trigger = screen.getByRole('button', {
      name: `More actions for ${conversations[0]!.title}`,
    })

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.getByRole('menu')).toBeInTheDocument()

    const menuItems = screen.getAllByRole('menuitem')
    expect(menuItems).toHaveLength(4)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes the desktop menu when focus tabs away from it', () => {
    const { conversations } = renderSidebarContent('desktop')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')
    const lastMenuItem = menuItems[menuItems.length - 1]!

    lastMenuItem.focus()
    fireEvent.keyDown(lastMenuItem, { key: 'Tab' })
    document.body.focus()
    fireEvent.blur(lastMenuItem, { relatedTarget: document.body })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders the desktop menu with a separated destructive action', () => {
    const { conversations } = renderSidebarContent('desktop')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    expect(screen.getByRole('separator')).toBeInTheDocument()

    const deleteButton = screen.getByRole('menuitem', { name: 'Delete' })
    expect(deleteButton.className).toContain('text-[var(--danger)]')
    expect(deleteButton.className).not.toContain('bg-[var(--danger)]')
  })

  it('keeps the desktop menu open when pressing on the delete icon and deletes on click', () => {
    const { conversations, handlers } = renderSidebarContent('desktop')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    const menu = screen.getByRole('menu')
    const deleteButton = within(menu).getByRole('menuitem', { name: 'Delete' })
    const deleteIcon = deleteButton.querySelector('svg')

    expect(deleteIcon).not.toBeNull()

    fireEvent.mouseDown(deleteIcon!)

    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(deleteButton)

    expect(handlers.onDeleteConversation).toHaveBeenCalledWith(conversations[0]!.id)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the desktop menu when the conversation list changes', () => {
    const conversations = [
      createConversation(1, 'First desktop chat'),
      createConversation(2, 'Second desktop chat'),
    ]

    const handlers = createHandlers()

    const { rerender } = render(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="desktop"
          currentConversationId="1"
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

    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument()

    rerender(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="desktop"
          currentConversationId="2"
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

    expect(screen.queryByRole('menuitem', { name: 'Pin' })).not.toBeInTheDocument()
  })

  it('closes the desktop menu when clicking outside the trigger and menu', () => {
    const { conversations } = renderSidebarContent('desktop')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the desktop menu when the desktop sidebar collapses', () => {
    const conversations = [
      createConversation(1, 'First desktop chat'),
      createConversation(2, 'Second desktop chat'),
    ]
    const handlers = createHandlers()

    const { rerender } = render(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="desktop"
          currentConversationId="1"
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

    expect(screen.getByRole('menu')).toBeInTheDocument()

    rerender(
      <TestProviders>
        <SidebarContent
          collapsed
          variant="desktop"
          currentConversationId="1"
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

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders a collapsed desktop variant without search controls and keeps logout accessible', () => {
    const handlers = createHandlers()

    render(
      <TestProviders>
        <SidebarContent
          collapsed
          variant="desktop"
          currentConversationId="1"
          conversations={[createConversation(1, 'Collapsed chat')]}
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

    expect(screen.queryByPlaceholderText('Search conversations')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('opens upward when the measured menu would overflow below the scroll container', () => {
    const { conversations } = renderSidebarContent('desktop')

    const scrollContainer = screen.getByText('Recents').parentElement?.nextElementSibling
    const trigger = screen.getByRole('button', {
      name: `More actions for ${conversations[1]!.title}`,
    })

    expect(scrollContainer).not.toBeNull()

    vi.spyOn(scrollContainer!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 272,
      height: 220,
      top: 0,
      right: 272,
      bottom: 220,
      left: 0,
      toJSON: () => ({}),
    })

    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 220,
      y: 170,
      width: 32,
      height: 32,
      top: 170,
      right: 252,
      bottom: 202,
      left: 220,
      toJSON: () => ({}),
    })

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu')

    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({
      x: 68,
      y: 0,
      width: 184,
      height: 188,
      top: 0,
      right: 252,
      bottom: 188,
      left: 68,
      toJSON: () => ({}),
    })

    fireEvent.click(trigger)
    fireEvent.click(trigger)

    expect(screen.getByRole('menu').className).toContain('bottom-full')
    expect(screen.getByRole('menu').className).not.toContain('top-full')
  })

  it('disables desktop conversation interactions while a reply is streaming', () => {
    const conversations = [
      createConversation(1, 'First desktop chat'),
      createConversation(2, 'Second desktop chat'),
    ]
    const handlers = createHandlers()

    render(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="desktop"
          interactionDisabled
          currentConversationId="1"
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

    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: conversations[0]!.title,
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    ).toBeDisabled()

    fireEvent.click(
      screen.getByRole('button', {
        name: conversations[1]!.title,
      }),
    )

    expect(handlers.onSelectConversation).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
