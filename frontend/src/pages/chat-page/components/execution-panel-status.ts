import type {
  ExecutionItemStatus,
  ExecutionRunStatus,
} from './execution-panel-model'

export type ExecutionStatus = ExecutionRunStatus | ExecutionItemStatus

const statusStyles: Record<
  ExecutionStatus,
  {
    badgeClassName: string
    panelClassName: string
    iconClassName: string
    railClassName: string
    dotClassName: string
  }
> = {
  running: {
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-800',
    panelClassName: 'border-amber-200/70 bg-linear-to-br from-amber-50 via-white to-white',
    iconClassName: 'text-amber-600',
    railClassName: 'border-amber-200 bg-amber-50/70 text-amber-900',
    dotClassName: 'bg-amber-500',
  },
  completed: {
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    panelClassName: 'border-emerald-200/70 bg-linear-to-br from-emerald-50 via-white to-white',
    iconClassName: 'text-emerald-600',
    railClassName: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    dotClassName: 'bg-emerald-500',
  },
  waiting_confirmation: {
    badgeClassName: 'border-sky-200 bg-sky-50 text-sky-800',
    panelClassName: 'border-sky-200/80 bg-linear-to-br from-sky-50 via-white to-white',
    iconClassName: 'text-sky-600',
    railClassName: 'border-sky-200 bg-sky-50/80 text-sky-900',
    dotClassName: 'bg-sky-500',
  },
  failed: {
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-800',
    panelClassName: 'border-rose-200/80 bg-linear-to-br from-rose-50 via-white to-white',
    iconClassName: 'text-rose-600',
    railClassName: 'border-rose-200 bg-rose-50/80 text-rose-900',
    dotClassName: 'bg-rose-500',
  },
  cancelled: {
    badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    panelClassName: 'border-slate-200 bg-linear-to-br from-slate-100 via-white to-white',
    iconClassName: 'text-slate-500',
    railClassName: 'border-slate-200 bg-slate-100 text-slate-800',
    dotClassName: 'bg-slate-400',
  },
}

export function executionStatusBadgeClassName(status: ExecutionStatus) {
  return statusStyles[status].badgeClassName
}

export function executionStatusPanelClassName(status: ExecutionRunStatus) {
  return statusStyles[status].panelClassName
}

export function executionStatusRailClassName(status: ExecutionStatus) {
  return statusStyles[status].railClassName
}

export function executionStatusDotClassName(status: ExecutionStatus) {
  return statusStyles[status].dotClassName
}

export function executionStatusIconClassName(status: ExecutionStatus) {
  return statusStyles[status].iconClassName
}
