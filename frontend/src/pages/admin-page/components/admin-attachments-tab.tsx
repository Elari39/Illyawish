import type { I18nContextValue } from '../../../i18n/context'
import type { AdminUsageStats, AdminUser } from '../../../types/chat'
import type { AttachmentPolicyDraft } from '../admin-page-helpers'
import { LabeledInput } from './admin-form-fields'

export function AdminAttachmentsTab({
  attachmentPolicyDraft,
  usageStats,
  users,
  isSavingPolicy,
  t,
  setAttachmentPolicyDraft,
  onSaveAttachmentPolicy,
  onPurgeUser,
  onPurgeAll,
}: {
  attachmentPolicyDraft: AttachmentPolicyDraft
  usageStats: AdminUsageStats | null
  users: AdminUser[]
  isSavingPolicy: boolean
  t: I18nContextValue['t']
  setAttachmentPolicyDraft: React.Dispatch<React.SetStateAction<AttachmentPolicyDraft | null>>
  onSaveAttachmentPolicy: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onPurgeUser: (user: AdminUser) => void
  onPurgeAll: () => void
}) {
  return (
    <section className="space-y-6">
      <form
        className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-md)]"
        onSubmit={onSaveAttachmentPolicy}
      >
        <h2 className="text-xl font-semibold">{t('admin.attachments.title')}</h2>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          {t('admin.attachments.description')}
        </p>
        <div className="mt-5 max-w-sm">
          <LabeledInput
            label={t('admin.attachments.retentionDays')}
            inputMode="numeric"
            value={attachmentPolicyDraft.attachmentRetentionDays}
            onChange={(value) => setAttachmentPolicyDraft((previous) => previous ? {
              ...previous,
              attachmentRetentionDays: value,
            } : previous)}
          />
        </div>
        <div className="mt-4 rounded-2xl bg-[var(--app-bg)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {t('admin.attachments.totalCount', {
            count: usageStats?.totalAttachments ?? 0,
          })}
        </div>
        <button
          className="mt-5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSavingPolicy}
          type="submit"
        >
          {isSavingPolicy ? t('common.saving') : t('admin.attachments.savePolicy')}
        </button>
      </form>

      <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-md)]">
        <h2 className="text-xl font-semibold">{t('admin.attachments.userCleanupTitle')}</h2>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          {t('admin.attachments.userCleanupDescription')}
        </p>
        <div className="mt-5 space-y-3">
          {users.map((user) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-4 py-4"
              key={user.id}
            >
              <div>
                <div className="text-sm font-medium text-[var(--foreground)]">{user.username}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{user.role}</div>
              </div>
              <button
                className="rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white"
                onClick={() => onPurgeUser(user)}
                type="button"
              >
                {t('admin.attachments.deleteUser', { username: user.username })}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] border border-[var(--danger)]/20 bg-[var(--danger)]/8 p-6 shadow-[var(--shadow-md)]">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">{t('admin.attachments.dangerTitle')}</h2>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          {t('admin.attachments.dangerDescription')}
        </p>
        <button
          className="mt-5 rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white"
          onClick={onPurgeAll}
          type="button"
        >
          {t('admin.attachments.deleteAll')}
        </button>
      </div>
    </section>
  )
}
