import type { I18nContextValue } from '../../../i18n/context'
import { formatDateTime } from '../../../lib/utils'
import type { AuditLog } from '../../../types/chat'
import type { AuditFilters } from '../admin-page-helpers'
import { LabeledInput } from './admin-form-fields'

export function AdminAuditTab({
  auditLogs,
  auditTotal,
  auditFilters,
  isLoadingAudit,
  locale,
  t,
  setAuditFilters,
  onApplyFilters,
  onResetFilters,
}: {
  auditLogs: AuditLog[]
  auditTotal: number
  auditFilters: AuditFilters
  isLoadingAudit: boolean
  locale: string
  t: I18nContextValue['t']
  setAuditFilters: React.Dispatch<React.SetStateAction<AuditFilters>>
  onApplyFilters: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onResetFilters: () => Promise<void>
}) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('admin.auditTitle')}</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
            {t('admin.audit.filtersDescription')}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {t('admin.audit.resultCount', { count: auditLogs.length, total: auditTotal })}
        </div>
      </div>

      <form className="mt-5 grid gap-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={onApplyFilters}>
        <LabeledInput
          label={t('admin.audit.filterActor')}
          value={auditFilters.actor}
          onChange={(value) => setAuditFilters((previous) => ({ ...previous, actor: value }))}
        />
        <LabeledInput
          label={t('admin.audit.filterAction')}
          value={auditFilters.action}
          onChange={(value) => setAuditFilters((previous) => ({ ...previous, action: value }))}
        />
        <LabeledInput
          label={t('admin.audit.filterTargetType')}
          value={auditFilters.targetType}
          onChange={(value) => setAuditFilters((previous) => ({ ...previous, targetType: value }))}
        />
        <LabeledInput
          label={t('admin.audit.filterDateFrom')}
          type="date"
          value={auditFilters.dateFrom}
          onChange={(value) => setAuditFilters((previous) => ({ ...previous, dateFrom: value }))}
        />
        <LabeledInput
          label={t('admin.audit.filterDateTo')}
          type="date"
          value={auditFilters.dateTo}
          onChange={(value) => setAuditFilters((previous) => ({ ...previous, dateTo: value }))}
        />

        <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-5">
          <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isLoadingAudit} type="submit">
            {isLoadingAudit ? t('common.loading') : t('admin.audit.applyFilters')}
          </button>
          <button
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--foreground)] disabled:opacity-60"
            disabled={isLoadingAudit}
            onClick={() => void onResetFilters()}
            type="button"
          >
            {t('admin.audit.resetFilters')}
          </button>
        </div>
      </form>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">{t('admin.audit.time')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.audit.actor')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.audit.action')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.audit.target')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.audit.summary')}</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr className="border-t border-[var(--line)]" key={log.id}>
                <td className="px-3 py-3">{formatDateTime(log.createdAt, locale)}</td>
                <td className="px-3 py-3">{log.actorUsername || t('admin.audit.system')}</td>
                <td className="px-3 py-3">{log.action}</td>
                <td className="px-3 py-3">{log.targetName || log.targetId || '-'}</td>
                <td className="px-3 py-3">{log.summary}</td>
              </tr>
            ))}
            {auditLogs.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[var(--muted-foreground)]" colSpan={5}>
                  {t('admin.audit.empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
