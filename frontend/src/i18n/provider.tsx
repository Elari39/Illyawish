import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { I18nContext } from './context'
import {
  APP_LOCALE_STORAGE_KEY,
  DEFAULT_APP_LOCALE,
  getInitialLocale,
  type AppLocale,
} from './config'
import {
  formatMessage,
  getCachedMessages,
  getFallbackMessages,
  loadMessages,
  type TranslationKey,
  type TranslationTable,
  type TranslationValues,
} from './messages'

export function I18nProvider({ children }: { children: ReactNode }) {
  const fallbackMessages = getFallbackMessages()
  const [initialLocale] = useState<AppLocale>(() => getInitialLocale())
  const [locale, setLocaleState] = useState<AppLocale>(() => initialLocale)
  const [loadedBundle, setLoadedBundle] = useState<{
    locale: AppLocale
    messages: TranslationTable
  } | null>(() => {
    const cachedCatalog = getCachedMessages(initialLocale)
    if (!cachedCatalog) {
      return null
    }

    return {
      locale: initialLocale,
      messages: cachedCatalog,
    }
  })
  const messageCatalog =
    getCachedMessages(locale) ??
    (loadedBundle?.locale === locale ? loadedBundle.messages : fallbackMessages)
  const localeRequestIdRef = useRef(0)
  const pendingLocaleRef = useRef<AppLocale | null>(null)

  useEffect(() => {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (getCachedMessages(locale) || loadedBundle?.locale === locale) {
      pendingLocaleRef.current = null
      return
    }

    const requestId = ++localeRequestIdRef.current
    pendingLocaleRef.current = locale

    void loadMessages(locale)
      .then((nextCatalog) => {
        if (localeRequestIdRef.current !== requestId) {
          return
        }

        pendingLocaleRef.current = null
        setLoadedBundle({
          locale,
          messages: nextCatalog,
        })
      })
      .catch(() => {
        if (localeRequestIdRef.current !== requestId) {
          return
        }

        pendingLocaleRef.current = null
        setLocaleState(DEFAULT_APP_LOCALE)
        setLoadedBundle(null)
      })
  }, [loadedBundle?.locale, locale])

  const setLocale = useCallback((nextLocale: AppLocale) => {
    if (
      nextLocale === locale ||
      nextLocale === pendingLocaleRef.current
    ) {
      return
    }

    pendingLocaleRef.current = nextLocale
    setLocaleState(nextLocale)
  }, [locale])

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      formatMessage(messageCatalog[key], values),
    [messageCatalog],
  )

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}
