import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../../components/auth/use-auth'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import { authApi, isNetworkError } from '../../../lib/api'
import type { TranslationKey } from '../../../i18n/messages'

const SECURITY_ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
  'current password is incorrect': 'error.securityCurrentPasswordIncorrect',
  'password is required': 'error.securityPasswordRequired',
  'password must be at least 8 characters long': 'error.securityPasswordTooShort',
  'invalid change password payload': 'error.securityInvalidChangePasswordPayload',
}

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

  function getSecurityErrorMessage(nextError: unknown) {
    if (isNetworkError(nextError)) {
      return t('error.backendUnavailable')
    }

    if (nextError instanceof Error) {
      const messageKey = SECURITY_ERROR_MESSAGE_KEYS[nextError.message]
      if (messageKey) {
        return t(messageKey)
      }
      if (nextError.message.trim()) {
        return nextError.message
      }
    }

    return t('error.saveSettings')
  }

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
      setSuccessMessage(t('settings.securityPasswordChanged'))
    } catch (nextError) {
      setError(getSecurityErrorMessage(nextError))
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
      setError(getSecurityErrorMessage(nextError))
      setIsRevoking(false)
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          {t('settings.securityChangePasswordTitle')}
        </h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          {t('settings.securityChangePasswordDescription')}
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleChangePassword}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">{t('settings.securityCurrentPassword')}</span>
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{t('settings.securityNewPassword')}</span>
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
            {isSaving ? t('common.saving') : t('settings.securitySubmitPasswordChange')}
          </Button>
        </form>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          {t('settings.securitySessionTitle')}
        </h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          {t('settings.securitySessionDescription')}
        </p>

        <Button
          className="mt-5"
          disabled={isRevoking}
          onClick={() => void handleLogoutAll()}
          variant="secondary"
        >
          {isRevoking ? t('common.loading') : t('settings.securityLogoutAllSessions')}
        </Button>
      </section>
    </div>
  )
}
