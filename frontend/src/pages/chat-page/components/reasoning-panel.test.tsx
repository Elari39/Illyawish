import { fireEvent, render, screen } from '@testing-library/react'

import { TestProviders } from '../../../test/test-providers'
import { ReasoningPanel } from './reasoning-panel'

describe('ReasoningPanel', () => {
  it('renders the collapsed preview as a true two-line summary for completed reasoning', () => {
    render(
      <TestProviders>
        <ReasoningPanel
          reasoningCompletedAt={18_000}
          reasoningContent={'step 1\nstep 2'}
          reasoningStartedAt={0}
          status="completed"
        />
      </TestProviders>,
    )

    const preview = screen.getByText((_, element) =>
      element?.textContent === 'step 1\nstep 2',
    )

    expect(preview).not.toHaveClass('truncate')
    expect(preview).toHaveClass('line-clamp-2')
  })

  it('marks completed reasoning steps as static once the stream has finished', () => {
    const { container } = render(
      <TestProviders>
        <ReasoningPanel
          reasoningCompletedAt={18_000}
          reasoningContent={'step 1\n\nstep 2\nstep 3'}
          reasoningStartedAt={0}
          status="completed"
        />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand reasoning' }))

    const indicators = Array.from(
      container.querySelectorAll('[data-testid="reasoning-step-indicator"]'),
    )

    expect(indicators).toHaveLength(3)
    expect(indicators.map((indicator) => indicator.getAttribute('data-state'))).toEqual([
      'complete',
      'complete',
      'complete',
    ])
  })

  it('keeps only the latest step active while reasoning is still streaming', () => {
    const { container } = render(
      <TestProviders>
        <ReasoningPanel
          reasoningContent={'step 1\nstep 2\nstep 3'}
          reasoningStartedAt={0}
          status="streaming"
        />
      </TestProviders>,
    )

    const indicators = Array.from(
      container.querySelectorAll('[data-testid="reasoning-step-indicator"]'),
    )

    expect(indicators).toHaveLength(3)
    expect(indicators.map((indicator) => indicator.getAttribute('data-state'))).toEqual([
      'complete',
      'complete',
      'active',
    ])
  })
})
