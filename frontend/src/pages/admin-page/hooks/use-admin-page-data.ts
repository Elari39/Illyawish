import { useCallback, useEffect, useMemo, useState } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { adminApi } from '../../../lib/api'
import type {
  AdminUsageStats,
  AdminUser,
  AuditLog,
  CreateUserPayload,
  WorkspacePolicy,
} from '../../../types/chat'
import {
  AUDIT_PAGE_SIZE,
  buildAuditLogListParams,
  defaultAuditFilters,
  emptyCreateUserForm,
  parseNullableNumber,
  toUserDraft,
  type AuditFilters,
  type UserDraft,
} from '../admin-page-helpers'

interface UseAdminPageDataOptions {
  t: I18nContextValue['t']
  setError: (value: string | null) => void
  setInfo: (value: string | null) => void
}

export function useAdminPageData({
  t,
  setError,
  setInfo,
}: UseAdminPageDataOptions) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [usageStats, setUsageStats] = useState<AdminUsageStats | null>(null)
  const [workspacePolicy, setWorkspacePolicy] = useState<WorkspacePolicy | null>(null)
  const [userDrafts, setUserDrafts] = useState<Record<number, UserDraft>>({})
  const [createUserForm, setCreateUserForm] = useState<CreateUserPayload>(emptyCreateUserForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [isSavingUserId, setIsSavingUserId] = useState<number | null>(null)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [isSavingPolicy, setIsSavingPolicy] = useState(false)
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(defaultAuditFilters)

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => left.username.localeCompare(right.username)),
    [users],
  )

  const loadAll = useCallback(async (filters: AuditFilters = defaultAuditFilters) => {
    setIsLoading(true)
    setError(null)

    try {
      const [nextUsers, nextAuditLogs, nextPolicy, nextUsageStats] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listAuditLogs({
          ...buildAuditLogListParams(filters),
          limit: AUDIT_PAGE_SIZE,
          offset: 0,
        }),
        adminApi.getWorkspacePolicy(),
        adminApi.getUsageStats(),
      ])
      setUsers(nextUsers)
      setAuditLogs(nextAuditLogs.logs)
      setAuditTotal(nextAuditLogs.total)
      setUsageStats(nextUsageStats)
      setWorkspacePolicy(nextPolicy)
      setUserDrafts(
        Object.fromEntries(
          nextUsers.map((item) => [item.id, toUserDraft(item)]),
        ),
      )
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.loadAdminData'))
    } finally {
      setIsLoading(false)
    }
  }, [setError, t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsCreatingUser(true)
    setError(null)
    setInfo(null)

    try {
      const createdUser = await adminApi.createUser({
        ...createUserForm,
        maxConversations: parseNullableNumber(createUserForm.maxConversations),
        maxAttachmentsPerMessage: parseNullableNumber(createUserForm.maxAttachmentsPerMessage),
        dailyMessageLimit: parseNullableNumber(createUserForm.dailyMessageLimit),
      })
      setUsers((previous) => [...previous, createdUser])
      setUserDrafts((previous) => ({
        ...previous,
        [createdUser.id]: toUserDraft(createdUser),
      }))
      setCreateUserForm(emptyCreateUserForm)
      setInfo(t('admin.feedback.userCreated', { username: createdUser.username }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.createUser'))
    } finally {
      setIsCreatingUser(false)
    }
  }

  async function handleSaveUser(userId: number) {
    const draft = userDrafts[userId]
    if (!draft) {
      return
    }

    setIsSavingUserId(userId)
    setError(null)
    setInfo(null)

    try {
      const updatedUser = await adminApi.updateUser(userId, {
        role: draft.role,
        status: draft.status,
        maxConversations: parseNullableNumber(draft.maxConversations),
        maxAttachmentsPerMessage: parseNullableNumber(draft.maxAttachmentsPerMessage),
        dailyMessageLimit: parseNullableNumber(draft.dailyMessageLimit),
      })
      setUsers((previous) => previous.map((item) => item.id === updatedUser.id ? updatedUser : item))
      setUserDrafts((previous) => ({
        ...previous,
        [updatedUser.id]: toUserDraft(updatedUser),
      }))
      setInfo(t('admin.feedback.userUpdated', { username: updatedUser.username }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.updateUser'))
    } finally {
      setIsSavingUserId(null)
    }
  }

  async function handleResetUserPassword(userId: number, newPassword: string) {
    const target = users.find((user) => user.id === userId)
    if (!target) {
      return
    }

    setIsSavingUserId(userId)
    setError(null)
    setInfo(null)

    try {
      await adminApi.resetUserPassword(userId, { newPassword })
      setInfo(t('admin.feedback.passwordReset', { username: target.username }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.resetUserPassword'))
    } finally {
      setIsSavingUserId(null)
    }
  }

  async function handleSavePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspacePolicy) {
      return
    }

    setIsSavingPolicy(true)
    setError(null)
    setInfo(null)

    try {
      const nextPolicy = await adminApi.updateWorkspacePolicy({
        defaultUserRole: workspacePolicy.defaultUserRole,
        defaultUserMaxConversations: parseNullableNumber(workspacePolicy.defaultUserMaxConversations),
        defaultUserMaxAttachmentsPerMessage: parseNullableNumber(workspacePolicy.defaultUserMaxAttachmentsPerMessage),
        defaultUserDailyMessageLimit: parseNullableNumber(workspacePolicy.defaultUserDailyMessageLimit),
      })
      setWorkspacePolicy(nextPolicy)
      setInfo(t('admin.feedback.policyUpdated'))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.updateWorkspacePolicy'))
    } finally {
      setIsSavingPolicy(false)
    }
  }

  async function handleApplyAuditFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsLoadingAudit(true)

    try {
      const result = await adminApi.listAuditLogs({
        ...buildAuditLogListParams(auditFilters),
        limit: AUDIT_PAGE_SIZE,
        offset: 0,
      })
      setAuditLogs(result.logs)
      setAuditTotal(result.total)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.loadAdminData'))
    } finally {
      setIsLoadingAudit(false)
    }
  }

  async function handleResetAuditFilters() {
    setAuditFilters(defaultAuditFilters)
    setError(null)
    setIsLoadingAudit(true)

    try {
      const result = await adminApi.listAuditLogs({
        limit: AUDIT_PAGE_SIZE,
        offset: 0,
      })
      setAuditLogs(result.logs)
      setAuditTotal(result.total)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.loadAdminData'))
    } finally {
      setIsLoadingAudit(false)
    }
  }

  return {
    users,
    sortedUsers,
    auditLogs,
    auditTotal,
    usageStats,
    workspacePolicy,
    userDrafts,
    createUserForm,
    isLoading,
    isLoadingAudit,
    isSavingUserId,
    isCreatingUser,
    isSavingPolicy,
    auditFilters,
    setUserDrafts,
    setCreateUserForm,
    setWorkspacePolicy,
    setAuditFilters,
    handleCreateUser,
    handleSaveUser,
    handleResetUserPassword,
    handleSavePolicy,
    handleApplyAuditFilters,
    handleResetAuditFilters,
  }
}
