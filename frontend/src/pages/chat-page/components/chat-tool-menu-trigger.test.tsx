import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import type { KnowledgeSpace } from '../../../types/chat'
import { ChatToolMenuTrigger } from './chat-tool-menu-trigger'

const knowledgeSpaces: KnowledgeSpace[] = [
  {
    id: 1,
    userId: 1,
    name: 'Engineering',
    description: '',
    createdAt: '2026-03-29T00:00:00Z',
    updatedAt: '2026-03-29T00:00:00Z',
  },
  {
    id: 2,
    userId: 1,
    name: 'Product',
    description: '',
    createdAt: '2026-03-29T00:00:00Z',
    updatedAt: '2026-03-29T00:00:00Z',
  },
]

describe('ChatToolMenuTrigger', () => {
  it('renders a unified tools trigger with no active indicator by default', () => {
    render(
      <TestProviders>
        <ChatToolMenuTrigger
          knowledgeSpaceIds={[]}
          knowledgeSpaces={knowledgeSpaces}
          onOpenKnowledgeSettings={vi.fn()}
        />
      </TestProviders>,
    )

    const trigger = screen.getByRole('button', { name: 'Tools' })

    expect(trigger).toBeInTheDocument()
    expect(trigger.className).toContain('w-9')
    expect(trigger.className).toContain('sm:w-auto')
    expect(screen.getByText('Tools').className).toContain('max-sm:hidden')
    expect(screen.queryByTestId('chat-tools-active-indicator')).not.toBeInTheDocument()
  })

  it('opens the menu, shows current summaries, and forwards menu item clicks', () => {
    const onOpenKnowledgeSettings = vi.fn()

    render(
      <TestProviders>
        <ChatToolMenuTrigger
          knowledgeSpaceIds={[1, 2]}
          knowledgeSpaces={knowledgeSpaces}
          onOpenKnowledgeSettings={onOpenKnowledgeSettings}
        />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Knowledge')).toBeInTheDocument()
    expect(screen.getByText('Knowledge enabled · 2 spaces')).toBeInTheDocument()
    expect(screen.getByTestId('chat-tools-active-indicator')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'KnowledgeKnowledge enabled · 2 spaces' }))
    expect(onOpenKnowledgeSettings).toHaveBeenCalledTimes(1)
  })

  it('closes the menu on outside click and Escape', () => {
    render(
      <TestProviders>
        <div>
          <button type="button">Outside target</button>
          <ChatToolMenuTrigger
            knowledgeSpaceIds={[]}
            knowledgeSpaces={knowledgeSpaces}
            onOpenKnowledgeSettings={vi.fn()}
          />
        </div>
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside target' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
