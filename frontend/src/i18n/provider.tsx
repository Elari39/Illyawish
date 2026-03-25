import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { I18nContext } from './context'
import {
  APP_LOCALE_STORAGE_KEY,
  getInitialLocale,
  type AppLocale,
} from './config'
import {
  formatMessage,
  messages,
  type TranslationKey,
  type TranslationValues,
} from './messages'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(() => getInitialLocale())

  useEffect(() => {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      formatMessage(messages[locale][key], values),
    [locale],
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
