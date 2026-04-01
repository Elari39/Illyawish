import type { Dispatch, SetStateAction } from 'react'

import type {
  AdminUser,
  AuditLogListParams,
  WorkspacePolicy,
} from '../../types/chat'
import {
  parseOptionalPositiveInteger,
  parseRequiredPositiveInteger,
} from '../../lib/numeric-input'

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

export interface CreateUserFormState {
  username: string
  password: string
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  maxConversations: string
  maxAttachmentsPerMessage: string
  dailyMessageLimit: string
}

export interface WorkspacePolicyDraft {
  defaultUserRole: 'admin' | 'member'
  defaultUserMaxConversations: string
  defaultUserMaxAttachmentsPerMessage: string
  defaultUserDailyMessageLimit: string
}

export interface AttachmentPolicyDraft {
  attachmentRetentionDays: string
}

export const emptyCreateUserForm: CreateUserFormState = {
  username: '',
  password: '',
  role: 'member',
  status: 'active',
  maxConversations: '',
  maxAttachmentsPerMessage: '',
  dailyMessageLimit: '',
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

export function toWorkspacePolicyDraft(
  policy: WorkspacePolicy,
): WorkspacePolicyDraft {
  return {
    defaultUserRole: policy.defaultUserRole,
    defaultUserMaxConversations:
      policy.defaultUserMaxConversations == null
        ? ''
        : String(policy.defaultUserMaxConversations),
    defaultUserMaxAttachmentsPerMessage:
      policy.defaultUserMaxAttachmentsPerMessage == null
        ? ''
        : String(policy.defaultUserMaxAttachmentsPerMessage),
    defaultUserDailyMessageLimit:
      policy.defaultUserDailyMessageLimit == null
        ? ''
        : String(policy.defaultUserDailyMessageLimit),
  }
}

export function toAttachmentPolicyDraft(
  policy: WorkspacePolicy,
): AttachmentPolicyDraft {
  return {
    attachmentRetentionDays: String(policy.attachmentRetentionDays),
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

export function parseOptionalPositiveIntegerFields<TField extends string>(
  values: Record<TField, string>,
) {
  const parsedValues = {} as Record<TField, number | null>
  const invalidFields: TField[] = []

  for (const [field, value] of Object.entries(values) as Array<[TField, string]>) {
    const result = parseOptionalPositiveInteger(value)
    if (!result.isValid) {
      invalidFields.push(field)
      continue
    }
    parsedValues[field] = result.value
  }

  return {
    isValid: invalidFields.length === 0,
    invalidFields,
    values: parsedValues,
  }
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

export {
  parseOptionalPositiveInteger,
  parseRequiredPositiveInteger,
}
