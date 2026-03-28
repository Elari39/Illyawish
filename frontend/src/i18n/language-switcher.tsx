import { APP_LOCALES, APP_LOCALE_LABELS } from './config'
import { useI18n } from './use-i18n'
import { cn } from '../lib/utils'

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, pendingLocale, setLocale, t } = useI18n()
  const selectedLocale = pendingLocale ?? locale

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
          aria-pressed={selectedLocale === value}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition',
            selectedLocale === value
              ? 'bg-[var(--brand)] text-white'
              : 'text-[var(--muted-foreground)] hover:bg-black/[0.04] hover:text-[var(--foreground)]',
            pendingLocale === value ? 'cursor-wait opacity-80' : null,
          )}
          disabled={pendingLocale === value}
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
