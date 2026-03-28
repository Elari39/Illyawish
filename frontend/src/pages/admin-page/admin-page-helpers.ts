import type { Dispatch, SetStateAction } from 'react'

import type {
  AdminUser,
  AuditLogListParams,
  CreateUserPayload,
} from '../../types/chat'

export type AdminTab = 'users' | 'audit' | 'policy' | 'attachments'

export interface AuditFilters {
  actor: string
  action: string
  targetType: string
  dateFrom: string
  dateTo: string
}

export interface UserDraft {
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  maxConversations: string
  maxAttachmentsPerMessage: string
  dailyMessageLimit: string
}

export const emptyCreateUserForm: CreateUserPayload = {
  username: '',
  password: '',
  role: 'member',
  status: 'active',
  maxConversations: null,
  maxAttachmentsPerMessage: null,
  dailyMessageLimit: null,
}

export const defaultAuditFilters: AuditFilters = {
  actor: '',
  action: '',
  targetType: '',
  dateFrom: '',
  dateTo: '',
}

export const AUDIT_PAGE_SIZE = 100

export function toUserDraft(user: AdminUser): UserDraft {
  return {
    role: user.role,
    status: user.status,
    maxConversations: user.maxConversations == null ? '' : String(user.maxConversations),
    maxAttachmentsPerMessage: user.maxAttachmentsPerMessage == null ? '' : String(user.maxAttachmentsPerMessage),
    dailyMessageLimit: user.dailyMessageLimit == null ? '' : String(user.dailyMessageLimit),
  }
}

export function updateDraft(
  userId: number,
  key: keyof UserDraft,
  value: string,
  setDrafts: Dispatch<SetStateAction<Record<number, UserDraft>>>,
) {
  setDrafts((previous) => ({
    ...previous,
    [userId]: {
      ...previous[userId],
      [key]: value,
    },
  }))
}

export function parseNullableNumber(value: number | string | null) {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildAuditLogListParams(filters: AuditFilters): AuditLogListParams {
  return {
    actor: filters.actor.trim() || undefined,
    action: filters.action.trim() || undefined,
    targetType: filters.targetType.trim() || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  }
}
