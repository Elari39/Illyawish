import { useState } from 'react'
import { ArrowLeft, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { Button } from '../components/ui/button'
import { useI18n } from '../i18n/use-i18n'
import { PromptDialog } from './chat-page/components/prompt-dialog'
import type { PromptState } from './chat-page/types'
import type { AdminUser } from '../types/chat'
import { type AdminTab } from './admin-page/admin-page-helpers'
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

export function AdminPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [resetPasswordPrompt, setResetPasswordPrompt] = useState<PromptState | null>(null)

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

          {data.isLoading ? (
            <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]">
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

          {!data.isLoading && activeTab === 'policy' && data.workspacePolicy ? (
            <AdminPolicyTab
              workspacePolicy={data.workspacePolicy}
              isSavingPolicy={data.isSavingPolicy}
              t={t}
              setWorkspacePolicy={data.setWorkspacePolicy}
              onSavePolicy={data.handleSavePolicy}
            />
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
