import { useI18n } from '../../../i18n/use-i18n'

export function EmptyState() {
  const { t } = useI18n()

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
      <div className="w-full max-w-2xl space-y-5 text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight text-[var(--foreground)] md:text-5xl">
          {t('empty.title')}
        </h2>
      </div>
    </div>
  )
}
