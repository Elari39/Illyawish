import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from './theme-provider'
import { useTheme } from './use-theme'

function ThemeProbe() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="resolved-theme-value">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        set dark
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
  })

  it('falls back to system theme when localStorage is unavailable and still updates theme', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme-value')).toHaveTextContent('system')
    expect(screen.getByTestId('resolved-theme-value')).toHaveTextContent('light')
    expect(document.documentElement).not.toHaveAttribute('data-theme')

    fireEvent.click(screen.getByRole('button', { name: 'set dark' }))

    return waitFor(() => {
      expect(screen.getByTestId('theme-value')).toHaveTextContent('dark')
      expect(screen.getByTestId('resolved-theme-value')).toHaveTextContent('dark')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    })
  })
})
