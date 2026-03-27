import type { I18nContextValue } from './context'
import type { AdminUser } from '../types/chat'

type Translate = I18nContextValue['t']

export function getAdminRoleLabel(
  role: AdminUser['role'],
  t: Translate,
) {
  return t(role === 'admin' ? 'admin.role.admin' : 'admin.role.member')
}

export function getAdminStatusLabel(
  status: AdminUser['status'],
  t: Translate,
) {
  return t(
    status === 'active'
      ? 'admin.status.active'
      : 'admin.status.disabled',
  )
}

export function getAdminAuditActorLabel(
  actorUsername: string | null | undefined,
  t: Translate,
) {
  return actorUsername || t('admin.audit.system')
}
