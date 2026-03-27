import type { AppLocale } from './config'
import { enUSMessages } from './catalogs/en-US'

export type TranslationValues = Record<
  string,
  string | number | boolean | null | undefined
>

export type TranslationKey = keyof typeof enUSMessages
export type TranslationTable = Record<TranslationKey, string>

const messageCatalogCache = new Map<AppLocale, TranslationTable>([
  ['en-US', enUSMessages],
])

export function getFallbackMessages() {
  return enUSMessages
}

export function getCachedMessages(locale: AppLocale) {
  return messageCatalogCache.get(locale)
}

export async function loadMessages(locale: AppLocale) {
  const cachedCatalog = messageCatalogCache.get(locale)
  if (cachedCatalog) {
    return cachedCatalog
  }

  let nextCatalog: TranslationTable
  switch (locale) {
    case 'zh-CN': {
      const module = await import('./catalogs/zh-CN')
      nextCatalog = module.zhCNMessages
      break
    }
    case 'ja-JP': {
      const module = await import('./catalogs/ja-JP')
      nextCatalog = module.jaJPMessages
      break
    }
    case 'en-US':
    default:
      nextCatalog = enUSMessages
      break
  }

  messageCatalogCache.set(locale, nextCatalog)
  return nextCatalog
}

export function formatMessage(
  template: string,
  values?: TranslationValues,
) {
  if (!values) {
    return template
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(values[key] ?? ''),
  )
}
