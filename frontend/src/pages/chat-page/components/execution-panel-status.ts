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
    badgeClassName: 'border-[var(--status-running-border)] bg-[var(--status-running-bg)] text-[var(--status-running-text)]',
    panelClassName: 'border-[var(--status-running-border)] bg-[var(--status-running-bg)]',
    iconClassName: 'text-[var(--status-running-icon)]',
    railClassName: 'border-[var(--status-running-border)] bg-[var(--status-running-bg)] text-[var(--status-running-text)]',
    dotClassName: 'bg-[var(--status-running-dot)]',
  },
  completed: {
    badgeClassName: 'border-[var(--status-completed-border)] bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
    panelClassName: 'border-[var(--status-completed-border)] bg-[var(--status-completed-bg)]',
    iconClassName: 'text-[var(--status-completed-icon)]',
    railClassName: 'border-[var(--status-completed-border)] bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
    dotClassName: 'bg-[var(--status-completed-dot)]',
  },
  waiting_confirmation: {
    badgeClassName: 'border-[var(--status-waiting-border)] bg-[var(--status-waiting-bg)] text-[var(--status-waiting-text)]',
    panelClassName: 'border-[var(--status-waiting-border)] bg-[var(--status-waiting-bg)]',
    iconClassName: 'text-[var(--status-waiting-icon)]',
    railClassName: 'border-[var(--status-waiting-border)] bg-[var(--status-waiting-bg)] text-[var(--status-waiting-text)]',
    dotClassName: 'bg-[var(--status-waiting-dot)]',
  },
  failed: {
    badgeClassName: 'border-[var(--status-failed-border)] bg-[var(--status-failed-bg)] text-[var(--status-failed-text)]',
    panelClassName: 'border-[var(--status-failed-border)] bg-[var(--status-failed-bg)]',
    iconClassName: 'text-[var(--status-failed-icon)]',
    railClassName: 'border-[var(--status-failed-border)] bg-[var(--status-failed-bg)] text-[var(--status-failed-text)]',
    dotClassName: 'bg-[var(--status-failed-dot)]',
  },
  cancelled: {
    badgeClassName: 'border-[var(--status-cancelled-border)] bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-text)]',
    panelClassName: 'border-[var(--status-cancelled-border)] bg-[var(--status-cancelled-bg)]',
    iconClassName: 'text-[var(--status-cancelled-icon)]',
    railClassName: 'border-[var(--status-cancelled-border)] bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-text)]',
    dotClassName: 'bg-[var(--status-cancelled-dot)]',
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
