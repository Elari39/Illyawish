import { BookMarked, Quote } from 'lucide-react'

import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { localizeExecutionStepName } from './execution-panel-labels'
import type { ExecutionRetrievalSummary } from './execution-panel-model'
import { executionStatusBadgeClassName } from './execution-panel-status'

interface ExecutionPanelRetrievalCardProps {
  retrieval: ExecutionRetrievalSummary
}

export function ExecutionPanelRetrievalCard({
  retrieval,
}: ExecutionPanelRetrievalCardProps) {
  const { t } = useI18n()

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <BookMarked className="h-4 w-4" />
            <p className="text-sm font-semibold">{t('executionPanel.retrievalTitle')}</p>
          </div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {localizeExecutionStepName(t, retrieval.stepName)}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-medium',
            executionStatusBadgeClassName(retrieval.status),
          )}
        >
          {t(`executionPanel.status.${retrieval.status}`)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric label={t('executionPanel.retrievalMetric.results')} value={String(retrieval.resultCount)} />
        <Metric label={t('executionPanel.retrievalMetric.citations')} value={String(retrieval.citationCount)} />
        <Metric label={t('executionPanel.retrievalMetric.spaces')} value={String(retrieval.knowledgeSpaceCount)} />
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <Quote className="h-3.5 w-3.5" />
          <span>{t('executionPanel.citationsTitle')}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {retrieval.displayCitationNames.map((name) => (
            <span
              className="rounded-full border border-[var(--line)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]"
              key={name}
            >
              {name}
            </span>
          ))}
          {retrieval.overflowCitationCount > 0 ? (
            <span className="rounded-full border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-medium text-[var(--muted-foreground)]">
              {t('executionPanel.citationOverflow', {
                count: retrieval.overflowCitationCount,
              })}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/55 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1.5 text-base font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  )
}
