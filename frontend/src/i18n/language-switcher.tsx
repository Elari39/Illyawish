import { APP_LOCALES, APP_LOCALE_LABELS } from './config'
import { useI18n } from './use-i18n'
import { cn } from '../lib/utils'

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n()

  return (
    <div
      aria-label={t('common.language')}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white p-1 shadow-sm',
        className,
      )}
      role="group"
    >
      <span className="px-2 text-xs font-medium text-[var(--muted-foreground)]">
        {t('common.language')}
      </span>
      {APP_LOCALES.map((value) => (
        <button
          aria-pressed={locale === value}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition',
            locale === value
              ? 'bg-[var(--brand)] text-white'
              : 'text-[var(--muted-foreground)] hover:bg-black/[0.04] hover:text-[var(--foreground)]',
          )}
          key={value}
          onClick={() => setLocale(value)}
          type="button"
        >
          {APP_LOCALE_LABELS[value]}
        </button>
      ))}
    </div>
  )
}
