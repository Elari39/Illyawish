import { getAdminRoleLabel, getAdminStatusLabel } from '../../../i18n/admin'
import type { I18nContextValue } from '../../../i18n/context'
import { formatDateTime } from '../../../lib/utils'
import type { AdminUser, CreateUserPayload } from '../../../types/chat'
import { updateDraft, type UserDraft } from '../admin-page-helpers'
import { LabeledInput, LabeledSelect } from './admin-form-fields'

export function AdminUsersTab({
  createUserForm,
  sortedUsers,
  userDrafts,
  isCreatingUser,
  isSavingUserId,
  locale,
  t,
  setCreateUserForm,
  setUserDrafts,
  onCreateUser,
  onSaveUser,
  onResetPassword,
}: {
  createUserForm: CreateUserPayload
  sortedUsers: AdminUser[]
  userDrafts: Record<number, UserDraft>
  isCreatingUser: boolean
  isSavingUserId: number | null
  locale: string
  t: I18nContextValue['t']
  setCreateUserForm: React.Dispatch<React.SetStateAction<CreateUserPayload>>
  setUserDrafts: React.Dispatch<React.SetStateAction<Record<number, UserDraft>>>
  onCreateUser: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onSaveUser: (userId: number) => Promise<void>
  onResetPassword: (target: AdminUser) => void
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_1.55fr]">
      <form className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]" onSubmit={onCreateUser}>
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

        <button className="mt-5 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={isCreatingUser} type="submit">
          {isCreatingUser ? t('admin.creatingUser') : t('admin.createUser')}
        </button>
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
                    <button
                      className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--foreground)] disabled:opacity-60"
                      disabled={isSavingUserId === item.id}
                      onClick={() => onResetPassword(item)}
                      type="button"
                    >
                      {t('admin.resetPassword')}
                    </button>
                    <button
                      className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      disabled={isSavingUserId === item.id}
                      onClick={() => void onSaveUser(item.id)}
                      type="button"
                    >
                      {isSavingUserId === item.id ? t('common.saving') : t('admin.saveUser')}
                    </button>
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
  )
}
