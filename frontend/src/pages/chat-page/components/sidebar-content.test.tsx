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
    onToggleDesktopSidebar: vi.fn(),
    onSearchChange: vi.fn(),
    onToggleArchived: vi.fn(),
    onSelectFolder: vi.fn(),
    onToggleTag: vi.fn(),
    onSetSelectionMode: vi.fn(),
    onToggleConversationSelection: vi.fn(),
    onMoveConversationToFolder: vi.fn(),
    onAddConversationTags: vi.fn(),
    onRemoveConversationTags: vi.fn(),
    onBulkMoveToFolder: vi.fn(),
    onBulkAddTags: vi.fn(),
    onBulkRemoveTags: vi.fn(),
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
    createConversation(1, 'First mobile chat', {
      folder: 'Work',
      tags: ['urgent', 'planning', 'ops'],
    }),
    createConversation(2, 'Second mobile chat', {
      tags: ['planning'],
    }),
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
        availableFolders={['Work']}
        availableTags={['ops', 'planning', 'urgent']}
        selectedFolder={null}
        selectedTags={[]}
        selectionMode={false}
        selectedConversationIds={[]}
        isLoading={false}
        isLoadingMore={false}
        username="Elaina"
        {...handlers}
      />
    </TestProviders>,
  )

  return { conversations, handlers }
}

function createDesktopSelectionModeSidebar() {
  const conversations = [
    createConversation(1, 'First mobile chat', {
      folder: 'Work',
      tags: ['urgent'],
    }),
    createConversation(2, 'Second mobile chat', {
      folder: 'Work',
      tags: ['planning'],
    }),
  ]
  const handlers = createHandlers()

  render(
    <TestProviders>
      <SidebarContent
        collapsed={false}
        variant="desktop"
        interactionDisabled={false}
        currentConversationId="1"
        conversations={conversations}
        hasMoreConversations={false}
        searchValue=""
        showArchived={false}
        availableFolders={['Work']}
        availableTags={['planning', 'urgent']}
        selectedFolder={null}
        selectedTags={[]}
        selectionMode
        selectedConversationIds={['1', '2']}
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
          availableFolders={[]}
          availableTags={[]}
          selectedFolder={null}
          selectedTags={[]}
          selectionMode={false}
          selectedConversationIds={[]}
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
          availableFolders={[]}
          availableTags={[]}
          selectedFolder={null}
          selectedTags={[]}
          selectionMode={false}
          selectedConversationIds={[]}
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
  it('renders folder navigation and tag filters in the expanded desktop sidebar', () => {
    const { handlers } = renderSidebarContent('desktop')

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }))

    expect(screen.getByRole('button', { name: 'All folders' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unfiled' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'planning' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    fireEvent.click(screen.getByRole('button', { name: 'planning' }))

    expect(handlers.onSelectFolder).toHaveBeenCalledWith('Work')
    expect(handlers.onToggleTag).toHaveBeenCalledWith('planning')
  })

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

  it('offers conversation organization actions from the desktop menu', () => {
    const { conversations, handlers } = renderSidebarContent('desktop')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to folder' }))
    expect(handlers.onMoveConversationToFolder).toHaveBeenCalledWith(conversations[0])

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add tags' }))
    expect(handlers.onAddConversationTags).toHaveBeenCalledWith(conversations[0])

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove tags' }))
    expect(handlers.onRemoveConversationTags).toHaveBeenCalledWith(conversations[0])
  })

  it('switches to selection mode and routes clicks to bulk selection', () => {
    const { conversations, handlers } = createDesktopSelectionModeSidebar()

    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: conversations[0]!.title }))
    expect(handlers.onToggleConversationSelection).toHaveBeenCalledWith(conversations[0]!.id)
    expect(handlers.onSelectConversation).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Move selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add tags to selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove tags from selected' }))

    expect(handlers.onBulkMoveToFolder).toHaveBeenCalled()
    expect(handlers.onBulkAddTags).toHaveBeenCalled()
    expect(handlers.onBulkRemoveTags).toHaveBeenCalled()
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
    expect(menuItems).toHaveLength(7)

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

  it('uses theme menu tokens for the desktop action menu instead of light color mixing', () => {
    const { conversations } = renderSidebarContent('desktop')

    fireEvent.click(
      screen.getByRole('button', {
        name: `More actions for ${conversations[0]!.title}`,
      }),
    )

    const menu = screen.getByRole('menu')
    expect(menu.className).toContain('bg-[var(--menu-bg)]')
    expect(menu.className).toContain('border-[var(--menu-border)]')
    expect(menu.className).toContain('shadow-[var(--menu-shadow)]')
    expect(menu.className).not.toContain('white_88%')
  })

  it('uses theme active-state tokens for desktop and mobile conversation items', () => {
    const { conversations } = renderSidebarContent('desktop')
    const desktopConversationButton = screen.getByRole('button', {
      name: conversations[0]!.title,
    })
    const desktopConversationItem = desktopConversationButton.closest('.group')

    expect(desktopConversationItem).not.toBeNull()
    expect(desktopConversationItem!.className).toContain('bg-[var(--sidebar-item-active-bg)]')
    expect(desktopConversationItem!.className).toContain('shadow-[var(--sidebar-item-active-shadow)]')
    expect(desktopConversationItem!.className).not.toContain('white)]')

    renderSidebarContent('mobile')
    const mobileConversationButton = screen.getAllByRole('button', {
      name: conversations[0]!.title,
    }).at(-1)
    const mobileConversationItem = mobileConversationButton?.closest('.group')

    expect(mobileConversationItem).not.toBeNull()
    expect(mobileConversationItem!.className).toContain('bg-[var(--sidebar-item-active-bg)]')
    expect(mobileConversationItem!.className).toContain('shadow-[var(--sidebar-item-active-shadow)]')
    expect(mobileConversationItem!.className).not.toContain('white)]')
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

  it('renders a collapsed desktop variant without search controls or history items and keeps logout accessible', () => {
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
    expect(screen.queryByRole('button', { name: 'Collapsed chat' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand conversation sidebar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('renders a desktop collapse toggle above new chat in the expanded sidebar', () => {
    const handlers = createHandlers()

    render(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="desktop"
          interactionDisabled={false}
          currentConversationId="1"
          conversations={[createConversation(1, 'Expanded chat')]}
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

    const collapseButton = screen.getByRole('button', { name: 'Collapse conversation sidebar' })
    const newChatButton = screen.getByRole('button', { name: 'New chat' })

    expect(collapseButton.compareDocumentPosition(newChatButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('forwards desktop sidebar toggle events from both collapsed and expanded header states', () => {
    const handlers = createHandlers()
    const { rerender } = render(
      <TestProviders>
        <SidebarContent
          collapsed
          variant="desktop"
          interactionDisabled={false}
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

    fireEvent.click(screen.getByRole('button', { name: 'Expand conversation sidebar' }))

    rerender(
      <TestProviders>
        <SidebarContent
          collapsed={false}
          variant="desktop"
          interactionDisabled={false}
          currentConversationId="1"
          conversations={[createConversation(1, 'Expanded chat')]}
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

    fireEvent.click(screen.getByRole('button', { name: 'Collapse conversation sidebar' }))

    expect(handlers.onToggleDesktopSidebar).toHaveBeenCalledTimes(2)
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
