import type { I18nContextValue } from '../../../i18n/context'
import type { AdminUsageStats } from '../../../types/chat'

function StatCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-4">
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--foreground)]">{value}</p>
    </article>
  )
}

export function AdminStatsPanel({
  usageStats,
  t,
}: {
  usageStats: AdminUsageStats
  t: I18nContextValue['t']
}) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-md)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('admin.statsTitle')}</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
            {t('admin.statsDescription')}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {t('admin.stats.activeProvidersSummary', {
            active: usageStats.activeProviderPresets,
            configured: usageStats.configuredProviderPresets,
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t('admin.stats.totalUsers')} value={String(usageStats.totalUsers)} />
        <StatCard label={t('admin.stats.activeUsers')} value={String(usageStats.activeUsers)} />
        <StatCard label={t('admin.stats.recentUsers')} value={String(usageStats.recentUsers)} />
        <StatCard label={t('admin.stats.totalConversations')} value={String(usageStats.totalConversations)} />
        <StatCard label={t('admin.stats.totalMessages')} value={String(usageStats.totalMessages)} />
        <StatCard label={t('admin.stats.totalAttachments')} value={String(usageStats.totalAttachments)} />
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {t('admin.stats.activeProviderDistribution')}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {t('admin.stats.activeProviderDistributionHelp')}
            </p>
          </div>
        </div>

        {usageStats.activeProviderDistribution.length > 0 ? (
          <div className="mt-4 space-y-3">
            {usageStats.activeProviderDistribution.map((item) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3" key={`${item.name}:${item.baseURL}`}>
                <div>
                  <p className="font-medium text-[var(--foreground)]">{item.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.baseURL}</p>
                </div>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {t('admin.stats.userCount', { count: item.userCount })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            {t('admin.stats.noActiveProviders')}
          </p>
        )}
      </div>
    </section>
  )
}
