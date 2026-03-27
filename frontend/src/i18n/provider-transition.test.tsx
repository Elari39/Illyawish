import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_LOCALE_STORAGE_KEY, type AppLocale } from './config'
import { LanguageSwitcher } from './language-switcher'

const i18nMocks = vi.hoisted(() => {
  const fallbackMessages = {
    'common.language': 'Language',
    'common.loading': 'Loading...',
  }
  const zhCNMessages = {
    'common.language': '语言',
    'common.loading': '加载中...',
  }
  const jaJPMessages = {
    'common.language': '言語',
    'common.loading': '読み込み中...',
  }

  return {
    fallbackMessages,
    zhCNMessages,
    jaJPMessages,
    getCachedMessagesMock: vi.fn(),
    loadMessagesMock: vi.fn(),
  }
})

vi.mock('./messages', async () => {
  const actual = await vi.importActual<typeof import('./messages')>('./messages')

  return {
    ...actual,
    getFallbackMessages: () => i18nMocks.fallbackMessages,
    getCachedMessages: (locale: AppLocale) => i18nMocks.getCachedMessagesMock(locale),
    loadMessages: (locale: AppLocale) => i18nMocks.loadMessagesMock(locale),
  }
})

import { I18nProvider } from './provider'
import { useI18n } from './use-i18n'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  // Keep rejected test promises from surfacing as unhandled rejections.
  void promise.catch(() => undefined)

  return { promise, resolve, reject }
}

function I18nProbe() {
  const { locale, t } = useI18n()

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="message">{t('common.loading')}</span>
    </div>
  )
}

describe('I18nProvider transition handling', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = ''
    i18nMocks.getCachedMessagesMock.mockReset()
    i18nMocks.loadMessagesMock.mockReset()

    i18nMocks.getCachedMessagesMock.mockImplementation((locale: AppLocale) => {
      switch (locale) {
        case 'en-US':
          return i18nMocks.fallbackMessages
        case 'zh-CN':
          return undefined
        case 'ja-JP':
          return undefined
      }
    })

    i18nMocks.loadMessagesMock.mockImplementation(async (locale: AppLocale) => {
      switch (locale) {
        case 'zh-CN':
          return i18nMocks.zhCNMessages
        case 'ja-JP':
          return i18nMocks.jaJPMessages
        case 'en-US':
        default:
          return i18nMocks.fallbackMessages
      }
    })
  })

  it('does not render fallback English before a saved locale finishes loading', async () => {
    const zhCNDeferred = createDeferred<typeof i18nMocks.zhCNMessages>()

    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'zh-CN')
    i18nMocks.loadMessagesMock.mockImplementation(async (locale: AppLocale) => {
      if (locale === 'zh-CN') {
        return zhCNDeferred.promise
      }
      return i18nMocks.fallbackMessages
    })

    render(
      <I18nProvider>
        <I18nProbe />
      </I18nProvider>,
    )

    expect(screen.queryByTestId('message')).not.toBeInTheDocument()

    zhCNDeferred.resolve(i18nMocks.zhCNMessages)

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
      expect(screen.getByTestId('message')).toHaveTextContent('加载中...')
    })
  })

  it('keeps the current locale visible until the next locale is ready', async () => {
    const jaJPDeferred = createDeferred<typeof i18nMocks.jaJPMessages>()

    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'zh-CN')
    i18nMocks.getCachedMessagesMock.mockImplementation((locale: AppLocale) => {
      switch (locale) {
        case 'en-US':
          return i18nMocks.fallbackMessages
        case 'zh-CN':
          return i18nMocks.zhCNMessages
        case 'ja-JP':
          return undefined
      }
    })
    i18nMocks.loadMessagesMock.mockImplementation(async (locale: AppLocale) => {
      if (locale === 'ja-JP') {
        return jaJPDeferred.promise
      }
      if (locale === 'zh-CN') {
        return i18nMocks.zhCNMessages
      }
      return i18nMocks.fallbackMessages
    })

    render(
      <I18nProvider>
        <LanguageSwitcher />
        <I18nProbe />
      </I18nProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
    expect(screen.getByTestId('message')).toHaveTextContent('加载中...')

    fireEvent.click(screen.getByRole('button', { name: '日本語' }))

    expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
    expect(screen.getByTestId('message')).toHaveTextContent('加载中...')
    expect(document.documentElement.lang).toBe('zh-CN')

    jaJPDeferred.resolve(i18nMocks.jaJPMessages)

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('ja-JP')
      expect(screen.getByTestId('message')).toHaveTextContent('読み込み中...')
    })
  })

  it('keeps the current locale when loading the next locale fails', async () => {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'zh-CN')
    i18nMocks.getCachedMessagesMock.mockImplementation((locale: AppLocale) => {
      switch (locale) {
        case 'en-US':
          return i18nMocks.fallbackMessages
        case 'zh-CN':
          return i18nMocks.zhCNMessages
        case 'ja-JP':
          return undefined
      }
    })
    i18nMocks.loadMessagesMock.mockImplementation(async (locale: AppLocale) => {
      if (locale === 'ja-JP') {
        throw new Error('failed to load locale')
      }
      if (locale === 'zh-CN') {
        return i18nMocks.zhCNMessages
      }
      return i18nMocks.fallbackMessages
    })

    render(
      <I18nProvider>
        <LanguageSwitcher />
        <I18nProbe />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '日本語' }))

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('zh-CN')
      expect(screen.getByTestId('message')).toHaveTextContent('加载中...')
      expect(document.documentElement.lang).toBe('zh-CN')
      expect(window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)).toBe('zh-CN')
    })
  })
})
