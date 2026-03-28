import { ShieldAlert, Wrench } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { localizeExecutionToolName } from './execution-panel-labels'
import type { ExecutionToolSummary } from './execution-panel-model'
import { executionStatusBadgeClassName } from './execution-panel-status'

interface ExecutionPanelToolCardProps {
  onConfirmToolCall: (approved: boolean) => Promise<void>
  tool: ExecutionToolSummary
}

export function ExecutionPanelToolCard({
  onConfirmToolCall,
  tool,
}: ExecutionPanelToolCardProps) {
  const { t } = useI18n()

  return (
    <section className="rounded-[1.35rem] border border-[var(--line)] bg-white/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <Wrench className="h-4 w-4" />
            <p className="text-sm font-semibold">{t('executionPanel.toolsTitle')}</p>
          </div>
          <p className="mt-2 truncate text-sm font-medium text-[var(--foreground)]">
            {localizeExecutionToolName(t, tool.toolName)}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-medium',
            executionStatusBadgeClassName(tool.status),
          )}
        >
          {t(`executionPanel.status.${tool.status}`)}
        </span>
      </div>

      {tool.outputPreview ? (
        <p className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/55 px-3 py-3 text-sm leading-6 text-[var(--muted-foreground)]">
          {tool.outputPreview}
        </p>
      ) : null}

      {tool.status === 'waiting_confirmation' ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-sky-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-sky-900">{t('executionPanel.confirmationNeeded')}</p>
              <p className="mt-1 text-sm text-sky-800">
                {tool.confirmationLabel || t('executionPanel.confirmationNeeded')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void onConfirmToolCall(false)} type="button" variant="secondary">
              {t('executionPanel.reject')}
            </Button>
            <Button onClick={() => void onConfirmToolCall(true)} type="button">
              {t('executionPanel.approve')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
