import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ArrowLeft, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import {
  getAdminAuditActorLabel,
  getAdminRoleLabel,
  getAdminStatusLabel,
} from '../i18n/admin'
import { useI18n } from '../i18n/use-i18n'
import { adminApi } from '../lib/api'
import { formatDateTime } from '../lib/utils'
import { PromptDialog } from './chat-page/components/prompt-dialog'
import type { PromptState } from './chat-page/types'
import type {
  AdminUser,
  AdminUsageStats,
  AuditLog,
  AuditLogListParams,
  CreateUserPayload,
  WorkspacePolicy,
} from '../types/chat'

type AdminTab = 'users' | 'audit' | 'policy'

interface AuditFilters {
  actor: string
  action: string
  targetType: string
  dateFrom: string
  dateTo: string
}

interface UserDraft {
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  maxConversations: string
  maxAttachmentsPerMessage: string
  dailyMessageLimit: string
}

const emptyCreateUserForm: CreateUserPayload = {
  username: '',
  password: '',
  role: 'member',
  status: 'active',
  maxConversations: null,
  maxAttachmentsPerMessage: null,
  dailyMessageLimit: null,
}

const defaultAuditFilters: AuditFilters = {
  actor: '',
  action: '',
  targetType: '',
  dateFrom: '',
  dateTo: '',
}

const AUDIT_PAGE_SIZE = 100

export function AdminPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [usageStats, setUsageStats] = useState<AdminUsageStats | null>(null)
  const [workspacePolicy, setWorkspacePolicy] = useState<WorkspacePolicy | null>(null)
  const [userDrafts, setUserDrafts] = useState<Record<number, UserDraft>>({})
  const [createUserForm, setCreateUserForm] = useState<CreateUserPayload>(emptyCreateUserForm)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [isSavingUserId, setIsSavingUserId] = useState<number | null>(null)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [isSavingPolicy, setIsSavingPolicy] = useState(false)
  const [resetPasswordPrompt, setResetPasswordPrompt] = useState<PromptState | null>(null)
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(defaultAuditFilters)

  const canManageUsers = user?.role === 'admin'
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
  }, [t])

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

  function handleResetPassword(target: AdminUser) {
    setResetPasswordPrompt({
      title: t('admin.resetPasswordTitle', { username: target.username }),
      initialValue: '',
      confirmLabel: t('admin.resetPassword'),
      onSubmit: async (newPassword) => {
        setIsSavingUserId(target.id)
        setError(null)
        setInfo(null)

        try {
          await adminApi.resetUserPassword(target.id, { newPassword })
          setInfo(t('admin.feedback.passwordReset', { username: target.username }))
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : t('error.resetUserPassword'))
        } finally {
          setIsSavingUserId(null)
        }
      },
    })
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

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
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

  if (!canManageUsers) {
    return null
  }

  return (
    <>
      <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 text-[var(--foreground)] md:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-[var(--line)] bg-white px-5 py-5 shadow-[var(--shadow-md)]">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-['Lora',serif] text-3xl font-bold tracking-tight">
                  {t('admin.title')}
                </h1>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {t('admin.description')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate('/chat')} variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                {t('admin.backToChat')}
              </Button>
              <Button onClick={() => void handleLogout()} variant="ghost">
                {t('sidebar.signOut')}
              </Button>
            </div>
          </header>

          <div className="inline-flex rounded-2xl border border-[var(--line)] bg-white p-1 shadow-sm">
            <AdminTabButton
              active={activeTab === 'users'}
              label={t('admin.tabs.users')}
              onClick={() => setActiveTab('users')}
            />
            <AdminTabButton
              active={activeTab === 'audit'}
              label={t('admin.tabs.audit')}
              onClick={() => setActiveTab('audit')}
            />
            <AdminTabButton
              active={activeTab === 'policy'}
              label={t('admin.tabs.policy')}
              onClick={() => setActiveTab('policy')}
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          {info ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {info}
            </div>
          ) : null}

          {isLoading ? (
            <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]">
              {t('admin.loading')}
            </section>
          ) : null}

          {!isLoading && usageStats ? (
            <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]">
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
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3" key={`${item.name}:${item.baseURL}`}>
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
          ) : null}

          {!isLoading && activeTab === 'users' ? (
            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.55fr]">
              <form className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]" onSubmit={handleCreateUser}>
                <h2 className="text-xl font-semibold">{t('admin.createUserTitle')}</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
                  {t('admin.createUserDescription')}
                </p>

                <div className="mt-5 space-y-4">
                  <LabeledInput label={t('login.username')} value={createUserForm.username} onChange={(value) => setCreateUserForm((previous) => ({ ...previous, username: value }))} />
                  <LabeledInput label={t('login.password')} type="password" value={createUserForm.password} onChange={(value) => setCreateUserForm((previous) => ({ ...previous, password: value }))} />
                  <LabeledSelect label={t('admin.field.role')} value={createUserForm.role} onChange={(value) => setCreateUserForm((previous) => ({ ...previous, role: value as 'admin' | 'member' }))}>
                    <option value="member">{getAdminRoleLabel('member', t)}</option>
                    <option value="admin">{getAdminRoleLabel('admin', t)}</option>
                  </LabeledSelect>
                  <LabeledSelect label={t('admin.field.status')} value={createUserForm.status} onChange={(value) => setCreateUserForm((previous) => ({ ...previous, status: value as 'active' | 'disabled' }))}>
                    <option value="active">{getAdminStatusLabel('active', t)}</option>
                    <option value="disabled">{getAdminStatusLabel('disabled', t)}</option>
                  </LabeledSelect>
                  <LabeledInput label={t('admin.field.maxConversations')} placeholder={t('admin.unlimited')} value={String(createUserForm.maxConversations ?? '')} onChange={(value) => setCreateUserForm((previous) => ({ ...previous, maxConversations: value === '' ? null : Number(value) }))} />
                  <LabeledInput label={t('admin.field.maxAttachmentsPerMessage')} placeholder={t('admin.unlimited')} value={String(createUserForm.maxAttachmentsPerMessage ?? '')} onChange={(value) => setCreateUserForm((previous) => ({ ...previous, maxAttachmentsPerMessage: value === '' ? null : Number(value) }))} />
                  <LabeledInput label={t('admin.field.dailyMessageLimit')} placeholder={t('admin.unlimited')} value={String(createUserForm.dailyMessageLimit ?? '')} onChange={(value) => setCreateUserForm((previous) => ({ ...previous, dailyMessageLimit: value === '' ? null : Number(value) }))} />
                </div>

                <Button className="mt-5 w-full" disabled={isCreatingUser} type="submit">
                  {isCreatingUser ? t('admin.creatingUser') : t('admin.createUser')}
                </Button>
              </form>

              <div className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]">
                <h2 className="text-xl font-semibold">{t('admin.usersTitle')}</h2>
                <div className="mt-5 space-y-4">
                  {sortedUsers.map((item) => {
                    const draft = userDrafts[item.id]
                    if (!draft) {
                      return null
                    }

                    return (
                      <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-4" key={item.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold">{item.username}</h3>
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                              {t('admin.lastLogin', {
                                value: item.lastLoginAt
                                  ? formatDateTime(item.lastLoginAt, locale)
                                  : t('admin.never'),
                              })}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={isSavingUserId === item.id}
                              onClick={() => handleResetPassword(item)}
                              variant="secondary"
                            >
                              {t('admin.resetPassword')}
                            </Button>
                            <Button
                              disabled={isSavingUserId === item.id}
                              onClick={() => void handleSaveUser(item.id)}
                            >
                              {isSavingUserId === item.id ? t('common.saving') : t('admin.saveUser')}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                          <LabeledSelect compact label={t('admin.field.role')} value={draft.role} onChange={(value) => updateDraft(item.id, 'role', value as 'admin' | 'member', setUserDrafts)}>
                            <option value="member">{getAdminRoleLabel('member', t)}</option>
                            <option value="admin">{getAdminRoleLabel('admin', t)}</option>
                          </LabeledSelect>
                          <LabeledSelect compact label={t('admin.field.status')} value={draft.status} onChange={(value) => updateDraft(item.id, 'status', value as 'active' | 'disabled', setUserDrafts)}>
                            <option value="active">{getAdminStatusLabel('active', t)}</option>
                            <option value="disabled">{getAdminStatusLabel('disabled', t)}</option>
                          </LabeledSelect>
                          <LabeledInput compact label={t('admin.field.conversations')} placeholder={t('admin.unlimited')} value={draft.maxConversations} onChange={(value) => updateDraft(item.id, 'maxConversations', value, setUserDrafts)} />
                          <LabeledInput compact label={t('admin.field.attachments')} placeholder={t('admin.unlimited')} value={draft.maxAttachmentsPerMessage} onChange={(value) => updateDraft(item.id, 'maxAttachmentsPerMessage', value, setUserDrafts)} />
                          <LabeledInput compact label={t('admin.field.dailyMessages')} placeholder={t('admin.unlimited')} value={draft.dailyMessageLimit} onChange={(value) => updateDraft(item.id, 'dailyMessageLimit', value, setUserDrafts)} />
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            </section>
          ) : null}

          {!isLoading && activeTab === 'audit' ? (
            <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{t('admin.auditTitle')}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
                    {t('admin.audit.filtersDescription')}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  {t('admin.audit.resultCount', { count: auditLogs.length, total: auditTotal })}
                </div>
              </div>

              <form className="mt-5 grid gap-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleApplyAuditFilters}>
                <LabeledInput
                  label={t('admin.audit.filterActor')}
                  value={auditFilters.actor}
                  onChange={(value) => setAuditFilters((previous) => ({ ...previous, actor: value }))}
                />
                <LabeledInput
                  label={t('admin.audit.filterAction')}
                  value={auditFilters.action}
                  onChange={(value) => setAuditFilters((previous) => ({ ...previous, action: value }))}
                />
                <LabeledInput
                  label={t('admin.audit.filterTargetType')}
                  value={auditFilters.targetType}
                  onChange={(value) => setAuditFilters((previous) => ({ ...previous, targetType: value }))}
                />
                <LabeledInput
                  label={t('admin.audit.filterDateFrom')}
                  type="date"
                  value={auditFilters.dateFrom}
                  onChange={(value) => setAuditFilters((previous) => ({ ...previous, dateFrom: value }))}
                />
                <LabeledInput
                  label={t('admin.audit.filterDateTo')}
                  type="date"
                  value={auditFilters.dateTo}
                  onChange={(value) => setAuditFilters((previous) => ({ ...previous, dateTo: value }))}
                />

                <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-5">
                  <Button disabled={isLoadingAudit} type="submit">
                    {isLoadingAudit ? t('common.loading') : t('admin.audit.applyFilters')}
                  </Button>
                  <Button
                    disabled={isLoadingAudit}
                    onClick={() => void handleResetAuditFilters()}
                    type="button"
                    variant="secondary"
                  >
                    {t('admin.audit.resetFilters')}
                  </Button>
                </div>
              </form>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('admin.audit.time')}</th>
                      <th className="px-3 py-2 font-medium">{t('admin.audit.actor')}</th>
                      <th className="px-3 py-2 font-medium">{t('admin.audit.action')}</th>
                      <th className="px-3 py-2 font-medium">{t('admin.audit.target')}</th>
                      <th className="px-3 py-2 font-medium">{t('admin.audit.summary')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr className="border-t border-[var(--line)]" key={log.id}>
                        <td className="px-3 py-3">{formatDateTime(log.createdAt, locale)}</td>
                        <td className="px-3 py-3">{getAdminAuditActorLabel(log.actorUsername, t)}</td>
                        <td className="px-3 py-3">{log.action}</td>
                        <td className="px-3 py-3">{log.targetName || log.targetId || '-'}</td>
                        <td className="px-3 py-3">{log.summary}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-[var(--muted-foreground)]" colSpan={5}>
                          {t('admin.audit.empty')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {!isLoading && activeTab === 'policy' && workspacePolicy ? (
            <form className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]" onSubmit={handleSavePolicy}>
              <h2 className="text-xl font-semibold">{t('admin.policyTitle')}</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
                {t('admin.policyDescription')}
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <LabeledSelect
                  label={t('admin.policy.defaultRole')}
                  value={workspacePolicy.defaultUserRole}
                  onChange={(value) => setWorkspacePolicy((previous) => previous ? { ...previous, defaultUserRole: value as 'admin' | 'member' } : previous)}
                >
                  <option value="member">{getAdminRoleLabel('member', t)}</option>
                  <option value="admin">{getAdminRoleLabel('admin', t)}</option>
                </LabeledSelect>
                <LabeledInput
                  label={t('admin.policy.defaultMaxConversations')}
                  placeholder={t('admin.unlimited')}
                  value={String(workspacePolicy.defaultUserMaxConversations ?? '')}
                  onChange={(value) => setWorkspacePolicy((previous) => previous ? { ...previous, defaultUserMaxConversations: value === '' ? null : Number(value) } : previous)}
                />
                <LabeledInput
                  label={t('admin.policy.defaultMaxAttachments')}
                  placeholder={t('admin.unlimited')}
                  value={String(workspacePolicy.defaultUserMaxAttachmentsPerMessage ?? '')}
                  onChange={(value) => setWorkspacePolicy((previous) => previous ? { ...previous, defaultUserMaxAttachmentsPerMessage: value === '' ? null : Number(value) } : previous)}
                />
                <LabeledInput
                  label={t('admin.policy.defaultDailyMessageLimit')}
                  placeholder={t('admin.unlimited')}
                  value={String(workspacePolicy.defaultUserDailyMessageLimit ?? '')}
                  onChange={(value) => setWorkspacePolicy((previous) => previous ? { ...previous, defaultUserDailyMessageLimit: value === '' ? null : Number(value) } : previous)}
                />
              </div>

              <Button className="mt-5" disabled={isSavingPolicy} type="submit">
                {isSavingPolicy ? t('common.saving') : t('admin.savePolicy')}
              </Button>
            </form>
          ) : null}
        </div>
      </main>
      <PromptDialog
        onClose={() => setResetPasswordPrompt(null)}
        promptState={resetPasswordPrompt}
      />
    </>
  )
}

function AdminTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={active
        ? 'rounded-xl bg-[var(--app-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground)]'
        : 'rounded-xl px-4 py-2 text-sm font-medium text-[var(--muted-foreground)]'}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  compact = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  compact?: boolean
}) {
  return (
    <label className="block space-y-2">
      <span className={compact ? 'text-xs font-medium text-[var(--muted-foreground)]' : 'text-sm font-medium'}>
        {label}
      </span>
      <Input
        className={compact ? 'px-3 py-2.5 text-sm' : undefined}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function LabeledSelect({
  label,
  value,
  onChange,
  children,
  compact = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  compact?: boolean
}) {
  return (
    <label className="block space-y-2">
      <span className={compact ? 'text-xs font-medium text-[var(--muted-foreground)]' : 'text-sm font-medium'}>
        {label}
      </span>
      <Select
        className={compact ? 'px-3 py-2.5 text-sm' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </Select>
    </label>
  )
}

function toUserDraft(user: AdminUser): UserDraft {
  return {
    role: user.role,
    status: user.status,
    maxConversations: user.maxConversations == null ? '' : String(user.maxConversations),
    maxAttachmentsPerMessage: user.maxAttachmentsPerMessage == null ? '' : String(user.maxAttachmentsPerMessage),
    dailyMessageLimit: user.dailyMessageLimit == null ? '' : String(user.dailyMessageLimit),
  }
}

function updateDraft(
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

function parseNullableNumber(value: number | string | null) {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildAuditLogListParams(filters: AuditFilters): AuditLogListParams {
  return {
    actor: filters.actor.trim() || undefined,
    action: filters.action.trim() || undefined,
    targetType: filters.targetType.trim() || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  }
}

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
