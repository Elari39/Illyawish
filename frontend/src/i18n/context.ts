import { createContext } from 'react'

import type { AppLocale } from './config'
import type { TranslationKey, TranslationValues } from './messages'

export interface I18nContextValue {
  locale: AppLocale
  pendingLocale: AppLocale | null
  isLocaleLoading: boolean
  setLocale: (locale: AppLocale) => void
  t: (key: TranslationKey, values?: TranslationValues) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)
