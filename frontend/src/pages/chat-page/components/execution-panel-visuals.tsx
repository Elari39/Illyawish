import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  LoaderCircle,
  OctagonX,
  PauseCircle,
} from 'lucide-react'

import { cn } from '../../../lib/utils'
import { executionStatusIconClassName, type ExecutionStatus } from './execution-panel-status'

export function ExecutionStatusIcon({
  className,
  status,
}: {
  className?: string
  status: ExecutionStatus
}) {
  const sharedClassName = cn('h-4 w-4', executionStatusIconClassName(status), className)

  if (status === 'completed') {
    return <CheckCircle2 className={sharedClassName} />
  }
  if (status === 'waiting_confirmation') {
    return <PauseCircle className={sharedClassName} />
  }
  if (status === 'failed') {
    return <OctagonX className={sharedClassName} />
  }
  if (status === 'cancelled') {
    return <AlertTriangle className={sharedClassName} />
  }
  return status === 'running' ? (
    <LoaderCircle className={cn(sharedClassName, 'animate-spin')} />
  ) : (
    <CircleDot className={sharedClassName} />
  )
}
