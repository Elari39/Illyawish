export type AppLocale = 'zh-CN' | 'en-US' | 'ja-JP'

export const APP_LOCALE_STORAGE_KEY = 'aichat:locale'
export const DEFAULT_APP_LOCALE: AppLocale = 'en-US'
export const APP_LOCALES: AppLocale[] = ['zh-CN', 'en-US', 'ja-JP']

export const APP_LOCALE_LABELS: Record<AppLocale, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
  'ja-JP': '日本語',
}

export function matchAppLocale(value?: string | null): AppLocale | null {
  if (!value) {
    return null
  }

  const normalized = value.toLowerCase()
  if (normalized.startsWith('zh')) {
    return 'zh-CN'
  }
  if (normalized.startsWith('ja')) {
    return 'ja-JP'
  }
  if (normalized.startsWith('en')) {
    return 'en-US'
  }

  return null
}

export function getInitialLocale() {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_LOCALE
  }

  const storedLocale = matchAppLocale(
    window.localStorage.getItem(APP_LOCALE_STORAGE_KEY),
  )
  if (storedLocale) {
    return storedLocale
  }

  const browserLocales = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language]

  for (const locale of browserLocales) {
    const matchedLocale = matchAppLocale(locale)
    if (matchedLocale) {
      return matchedLocale
    }
  }

  return DEFAULT_APP_LOCALE
}
