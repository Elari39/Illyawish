import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '../../i18n/provider'
import { MarkdownContent } from './markdown-content'

describe('MarkdownContent', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses the plain text fast path for simple assistant text', () => {
    render(
      <I18nProvider>
        <MarkdownContent content={'Hello from Illyawish.\nJust plain text.'} />
      </I18nProvider>,
    )

    expect(screen.getByTestId('plain-markdown-content')).toHaveTextContent(
      'Hello from Illyawish.',
    )
    expect(screen.queryByTestId('rich-markdown-content')).not.toBeInTheDocument()
  })

  it('keeps markdown rendering for rich content', () => {
    render(
      <I18nProvider>
        <MarkdownContent content={'Visit https://example.com for **details**.'} />
      </I18nProvider>,
    )

    expect(screen.getByTestId('rich-markdown-content')).toBeInTheDocument()
    expect(screen.queryByTestId('plain-markdown-content')).not.toBeInTheDocument()
  })

  it('clears the copy reset timer when a code block unmounts', async () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    const { unmount } = render(
      <I18nProvider>
        <MarkdownContent content={'```ts\nconsole.log("hi")\n```'} />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
