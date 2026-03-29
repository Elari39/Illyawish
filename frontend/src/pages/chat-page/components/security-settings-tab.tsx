import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../../components/auth/use-auth'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import { authApi } from '../../../lib/api'

export function SecuritySettingsTab() {
  const { logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await authApi.changePassword({
        currentPassword,
        newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setSuccessMessage('Password updated.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.saveSettings'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLogoutAll() {
    setIsRevoking(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await authApi.logoutAll()
      await logout()
      navigate('/login', { replace: true })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('error.saveSettings'))
      setIsRevoking(false)
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          Change password
        </h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          Update your current password and keep your workspace account secure.
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleChangePassword}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Current password</span>
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">New password</span>
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          {successMessage ? (
            <div className="rounded-xl border border-[var(--status-completed-border)] bg-[var(--status-completed-bg)] px-4 py-3 text-sm text-[var(--status-completed-text)]">
              {successMessage}
            </div>
          ) : null}

          <Button disabled={isSaving} type="submit">
            {isSaving ? t('common.saving') : 'Change password'}
          </Button>
        </form>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          Session security
        </h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          Sign out every active session for this account. You will need to log in again on all devices.
        </p>

        <Button
          className="mt-5"
          disabled={isRevoking}
          onClick={() => void handleLogoutAll()}
          variant="secondary"
        >
          {isRevoking ? t('common.loading') : 'Log out all sessions'}
        </Button>
      </section>
    </div>
  )
}
