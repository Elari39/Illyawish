import { useState } from 'react'
import { ArrowLeft, LogOut, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { Button } from '../components/ui/button'
import { useI18n } from '../i18n/use-i18n'
import { ConfirmationDialog } from './chat-page/components/confirmation-dialog'
import { PromptDialog } from './chat-page/components/prompt-dialog'
import type { ConfirmationState, PromptState } from './chat-page/types'
import type { AdminUser } from '../types/chat'
import { type AdminTab } from './admin-page/admin-page-helpers'
import { AdminAttachmentsTab } from './admin-page/components/admin-attachments-tab'
import { AdminAuditTab } from './admin-page/components/admin-audit-tab'
import { AdminPolicyTab } from './admin-page/components/admin-policy-tab'
import { AdminStatsPanel } from './admin-page/components/admin-stats-panel'
import { AdminUsersTab } from './admin-page/components/admin-users-tab'
import { useAdminPageData } from './admin-page/hooks/use-admin-page-data'

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
      aria-pressed={active}
      className={active
        ? 'shrink-0 whitespace-nowrap rounded-xl bg-[var(--app-bg)] px-3 py-2 text-sm font-medium text-[var(--foreground)] sm:px-4'
        : 'shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] sm:px-4'}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

export function AdminPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [resetPasswordPrompt, setResetPasswordPrompt] = useState<PromptState | null>(null)
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)

  const canManageUsers = user?.role === 'admin'
  const data = useAdminPageData({
    t,
    setError,
    setInfo,
  })

  function handleResetPassword(target: AdminUser) {
    setResetPasswordPrompt({
      title: t('admin.resetPasswordTitle', { username: target.username }),
      initialValue: '',
      confirmLabel: t('admin.resetPassword'),
      onSubmit: async (newPassword) => {
        await data.handleResetUserPassword(target.id, newPassword)
      },
    })
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function handlePurgeUser(userToPurge: AdminUser) {
    setConfirmation({
      title: t('admin.attachments.confirmUserTitle', { username: userToPurge.username }),
      description: t('admin.attachments.confirmUserDescription', { username: userToPurge.username }),
      confirmLabel: t('admin.attachments.confirmDelete'),
      variant: 'danger',
      onConfirm: async () => {
        const result = await data.handlePurgeAttachments({
          scope: 'user',
          userId: userToPurge.id,
        })
        setInfo(t('admin.feedback.attachmentsDeletedForUser', {
          username: userToPurge.username,
          count: result.deletedCount,
        }))
      },
    })
  }

  function handlePurgeAll() {
    setConfirmation({
      title: t('admin.attachments.confirmAllTitle'),
      description: t('admin.attachments.confirmAllDescription'),
      confirmLabel: t('admin.attachments.deleteAll'),
      variant: 'danger',
      onConfirm: async () => {
        const result = await data.handlePurgeAttachments({ scope: 'all' })
        setInfo(t('admin.feedback.attachmentsDeletedAll', { count: result.deletedCount }))
      },
    })
  }

  if (!canManageUsers) {
    return null
  }

  return (
    <>
      <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 text-[var(--foreground)] md:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-3 rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] px-5 py-5 shadow-[var(--shadow-md)] sm:items-center">
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
              <Button
                aria-label={t('admin.backToChat')}
                className="h-9 min-w-9 px-2.5 py-2 sm:h-auto sm:min-w-0 sm:px-4"
                onClick={() => navigate('/chat')}
                title={t('admin.backToChat')}
                variant="secondary"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="max-sm:sr-only">{t('admin.backToChat')}</span>
              </Button>
              <Button
                aria-label={t('sidebar.signOut')}
                className="h-9 min-w-9 px-2.5 py-2 sm:h-auto sm:min-w-0 sm:px-4"
                onClick={() => void handleLogout()}
                title={t('sidebar.signOut')}
                variant="ghost"
              >
                <LogOut className="h-4 w-4" />
                <span className="max-sm:sr-only">{t('sidebar.signOut')}</span>
              </Button>
            </div>
          </header>

          <div className="flex overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-1 shadow-sm">
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
            <AdminTabButton
              active={activeTab === 'attachments'}
              label={t('admin.tabs.attachments')}
              onClick={() => setActiveTab('attachments')}
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          {info ? (
            <div className="rounded-2xl border border-[var(--status-completed-border)] bg-[var(--status-completed-bg)] px-4 py-3 text-sm text-[var(--status-completed-text)]">
              {info}
            </div>
          ) : null}

          {data.isLoading ? (
            <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-md)]">
              {t('admin.loading')}
            </section>
          ) : null}

          {!data.isLoading && data.usageStats ? (
            <AdminStatsPanel usageStats={data.usageStats} t={t} />
          ) : null}

          {!data.isLoading && activeTab === 'users' ? (
            <AdminUsersTab
              createUserForm={data.createUserForm}
              sortedUsers={data.sortedUsers}
              userDrafts={data.userDrafts}
              isCreatingUser={data.isCreatingUser}
              isSavingUserId={data.isSavingUserId}
              locale={locale}
              t={t}
              setCreateUserForm={data.setCreateUserForm}
              setUserDrafts={data.setUserDrafts}
              onCreateUser={data.handleCreateUser}
              onSaveUser={data.handleSaveUser}
              onResetPassword={handleResetPassword}
            />
          ) : null}

          {!data.isLoading && activeTab === 'audit' ? (
            <AdminAuditTab
              auditLogs={data.auditLogs}
              auditTotal={data.auditTotal}
              auditFilters={data.auditFilters}
              isLoadingAudit={data.isLoadingAudit}
              locale={locale}
              t={t}
              setAuditFilters={data.setAuditFilters}
              onApplyFilters={data.handleApplyAuditFilters}
              onResetFilters={data.handleResetAuditFilters}
            />
          ) : null}

          {!data.isLoading && activeTab === 'policy' && data.workspacePolicyDraft ? (
            <AdminPolicyTab
              workspacePolicyDraft={data.workspacePolicyDraft}
              isSavingPolicy={data.isSavingPolicy}
              t={t}
              setWorkspacePolicyDraft={data.setWorkspacePolicyDraft}
              onSavePolicy={data.handleSavePolicy}
            />
          ) : null}

          {!data.isLoading && activeTab === 'attachments' && data.workspacePolicy ? (
            <AdminAttachmentsTab
              workspacePolicy={data.workspacePolicy}
              usageStats={data.usageStats}
              users={data.sortedUsers}
              isSavingPolicy={data.isSavingPolicy}
              t={t}
              setWorkspacePolicy={data.setWorkspacePolicy}
              onSavePolicy={data.handleSavePolicy}
              onPurgeUser={handlePurgeUser}
              onPurgeAll={handlePurgeAll}
            />
          ) : null}
        </div>
      </main>
      <ConfirmationDialog
        confirmation={confirmation}
        onClose={() => setConfirmation(null)}
      />
      <PromptDialog
        onClose={() => setResetPasswordPrompt(null)}
        promptState={resetPasswordPrompt}
      />
    </>
  )
}
