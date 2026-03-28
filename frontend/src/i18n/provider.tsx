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
  const [messageCatalog, setMessageCatalog] = useState<TranslationTable | null>(() =>
    getCachedMessages(initialLocale) ?? null,
  )
  const [pendingLocale, setPendingLocale] = useState<AppLocale | null>(() =>
    getCachedMessages(initialLocale) ? null : initialLocale,
  )
  const localeRequestIdRef = useRef(0)
  const isLocaleLoading = pendingLocale !== null

  useEffect(() => {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, pendingLocale ?? locale)
  }, [locale, pendingLocale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (!pendingLocale) {
      return
    }

    const requestId = ++localeRequestIdRef.current
    const targetLocale = pendingLocale

    void loadMessages(targetLocale)
      .then((nextCatalog) => {
        if (localeRequestIdRef.current !== requestId) {
          return
        }

        setMessageCatalog(nextCatalog)
        setLocaleState(targetLocale)
        setPendingLocale(null)
      })
      .catch(() => {
        if (localeRequestIdRef.current !== requestId) {
          return
        }

        setMessageCatalog(getCachedMessages(DEFAULT_APP_LOCALE) ?? fallbackMessages)
        setLocaleState(DEFAULT_APP_LOCALE)
        setPendingLocale(null)
      })
  }, [fallbackMessages, pendingLocale])

  const setLocale = useCallback((nextLocale: AppLocale) => {
    if (nextLocale === pendingLocale || (nextLocale === locale && pendingLocale === null)) {
      return
    }

    localeRequestIdRef.current += 1

    const cachedCatalog = getCachedMessages(nextLocale)
    if (cachedCatalog) {
      setMessageCatalog(cachedCatalog)
      setLocaleState(nextLocale)
      setPendingLocale(null)
      return
    }

    setPendingLocale(nextLocale)
  }, [locale, pendingLocale])

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      formatMessage((messageCatalog ?? fallbackMessages)[key], values),
    [fallbackMessages, messageCatalog],
  )

  if (!messageCatalog) {
    return <div aria-busy="true" data-testid="i18n-loading-shell" />
  }

  return (
    <I18nContext.Provider
      value={{
        locale,
        pendingLocale,
        isLocaleLoading,
        setLocale,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}
