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
  const [messageCatalog, setMessageCatalog] = useState(() =>
    getCachedMessages(initialLocale) ?? null,
  )
  const [isHydrated, setIsHydrated] = useState(() => (
    getCachedMessages(initialLocale) !== undefined
  ))
  const localeRequestIdRef = useRef(0)
  const pendingLocaleRef = useRef<AppLocale | null>(null)

  useEffect(() => {
    if (!isHydrated || !messageCatalog) {
      return
    }

    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [isHydrated, locale, messageCatalog])

  const commitLocale = useCallback((
    nextLocale: AppLocale,
    nextCatalog: TranslationTable,
  ) => {
    setLocaleState(nextLocale)
    setMessageCatalog(nextCatalog)
    setIsHydrated(true)
  }, [])

  const requestLocale = useCallback(async (
    nextLocale: AppLocale,
    options?: { fallbackOnFailure?: boolean },
  ) => {
    const requestId = ++localeRequestIdRef.current
    pendingLocaleRef.current = nextLocale

    try {
      const nextCatalog = await loadMessages(nextLocale)
      if (localeRequestIdRef.current !== requestId) {
        return false
      }

      pendingLocaleRef.current = null
      commitLocale(nextLocale, nextCatalog)
      return true
    } catch {
      if (localeRequestIdRef.current !== requestId) {
        return false
      }

      pendingLocaleRef.current = null
      if (options?.fallbackOnFailure) {
        commitLocale(DEFAULT_APP_LOCALE, fallbackMessages)
      } else {
        setIsHydrated(true)
      }
      return false
    }
  }, [commitLocale, fallbackMessages])

  useEffect(() => {
    if (messageCatalog) {
      return
    }

    let cancelled = false
    const requestId = ++localeRequestIdRef.current
    pendingLocaleRef.current = initialLocale

    void loadMessages(initialLocale)
      .then((nextCatalog) => {
        if (cancelled || localeRequestIdRef.current !== requestId) {
          return
        }

        pendingLocaleRef.current = null
        commitLocale(initialLocale, nextCatalog)
      })
      .catch(() => {
        if (cancelled || localeRequestIdRef.current !== requestId) {
          return
        }

        pendingLocaleRef.current = null
        commitLocale(DEFAULT_APP_LOCALE, fallbackMessages)
      })

    return () => {
      cancelled = true
    }
  }, [commitLocale, fallbackMessages, initialLocale, messageCatalog])

  const setLocale = useCallback((nextLocale: AppLocale) => {
    if (
      nextLocale === locale ||
      nextLocale === pendingLocaleRef.current
    ) {
      return
    }

    void requestLocale(nextLocale)
  }, [locale, requestLocale])

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      formatMessage((messageCatalog ?? fallbackMessages)[key], values),
    [fallbackMessages, messageCatalog],
  )

  if (!isHydrated || !messageCatalog) {
    return null
  }

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
