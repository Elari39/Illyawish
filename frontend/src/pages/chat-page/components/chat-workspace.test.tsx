import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChatWorkspace } from './chat-workspace'

vi.mock('./message-list', () => ({
  MessageList: () => <div data-testid="message-list" />,
}))

vi.mock('./chat-composer', () => ({
  ChatComposer: () => <div data-testid="chat-composer" />,
}))

describe('ChatWorkspace', () => {
  it('keeps header actions compact on mobile while preserving accessible labels', () => {
    render(
      <ChatWorkspace
        adminLabel="Admin"
        appName="Illyawish"
        chatError={null}
        composerProps={{} as never}
        composerToolTrigger={<div data-testid="tool-trigger" />}
        headerTitle="Conversation"
        isComposerExpanded={false}
        isHeroState={false}
        messageListProps={{} as never}
        modelControl={<div data-testid="model-control" />}
        openSidebarLabel="Open sidebar"
        settingsLabel="Settings"
        showAdminEntry
        onOpenAdmin={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenSidebar={vi.fn()}
        onToggleComposerExpanded={vi.fn()}
      />,
    )

    const settingsButton = screen.getByRole('button', { name: 'Settings' })
    expect(settingsButton.className).toContain('min-w-9')
    expect(settingsButton.className).toContain('sm:px-3')
    expect(screen.getByText('Settings').className).toContain('max-sm:sr-only')

    const adminButton = screen.getByRole('button', { name: 'Admin' })
    expect(adminButton.className).toContain('min-w-9')
    expect(adminButton.className).toContain('sm:px-3')
    expect(screen.getByText('Admin').className).toContain('max-sm:sr-only')
  })
})
