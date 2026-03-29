import { getAdminRoleLabel } from '../../../i18n/admin'
import type { I18nContextValue } from '../../../i18n/context'
import type { WorkspacePolicy } from '../../../types/chat'
import { LabeledInput, LabeledSelect } from './admin-form-fields'

export function AdminPolicyTab({
  workspacePolicy,
  isSavingPolicy,
  t,
  setWorkspacePolicy,
  onSavePolicy,
}: {
  workspacePolicy: WorkspacePolicy
  isSavingPolicy: boolean
  t: I18nContextValue['t']
  setWorkspacePolicy: React.Dispatch<React.SetStateAction<WorkspacePolicy | null>>
  onSavePolicy: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <form className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-md)]" onSubmit={onSavePolicy}>
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

      <button className="mt-5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isSavingPolicy} type="submit">
        {isSavingPolicy ? t('common.saving') : t('admin.savePolicy')}
      </button>
    </form>
  )
}
