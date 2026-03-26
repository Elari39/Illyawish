import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '../../i18n/provider'
import { MarkdownContent } from './markdown-content'

describe('MarkdownContent', () => {
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
})
