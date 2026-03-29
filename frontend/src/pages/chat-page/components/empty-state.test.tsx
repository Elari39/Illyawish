import { render, screen } from '@testing-library/react'

import { TestProviders } from '../../../test/test-providers'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders only the hero title without helper copy or continue action', () => {
    render(
      <TestProviders>
        <EmptyState />
      </TestProviders>,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'How can I help you today?' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Select a conversation from the sidebar, or start a new chat below.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue last conversation' }),
    ).not.toBeInTheDocument()
  })
})
