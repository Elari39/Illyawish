import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.unmock('./messages')

import { APP_LOCALE_STORAGE_KEY } from './config'
import { LanguageSwitcher } from './language-switcher'
import { I18nProvider } from './provider'
import { useI18n } from './use-i18n'

function I18nProbe() {
  const { locale, t } = useI18n()

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="message">{t('common.loading')}</span>
    </div>
  )
}

describe('I18nProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = ''
  })

  it('loads the default locale messages on mount', async () => {
    render(
      <I18nProvider>
        <I18nProbe />
      </I18nProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('en-US')
    expect(screen.getByTestId('message')).toHaveTextContent('Loading...')

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en-US')
    })
  })

  it('loads saved locale messages on mount', async () => {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'zh-CN')

    render(
      <I18nProvider>
        <I18nProbe />
      </I18nProvider>,
    )

    expect(screen.getByTestId('i18n-loading-shell')).toBeInTheDocument()
    expect(screen.queryByTestId('locale')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
      expect(screen.getByTestId('message')).toHaveTextContent('加载中...')
    }, { timeout: 3000 })

    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('loads a locale chunk when switching languages', async () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <I18nProbe />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '日本語' }))

    expect(screen.getByTestId('locale')).toHaveTextContent('en-US')
    expect(screen.getByTestId('message')).toHaveTextContent('Loading...')

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('ja-JP')
      expect(screen.getByTestId('message')).toHaveTextContent('読み込み中...')
    }, { timeout: 3000 })

    expect(document.documentElement.lang).toBe('ja-JP')
    expect(window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)).toBe('ja-JP')
  })
})
