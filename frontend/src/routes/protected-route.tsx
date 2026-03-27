import type { ReactElement } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { useI18n } from '../i18n/use-i18n'

function BackendUnavailableNotice() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6">
      <div className="max-w-xl rounded-3xl border border-[var(--danger)]/20 bg-white px-6 py-5 text-center shadow-[var(--shadow-md)]">
        <p className="text-base text-[var(--danger)]">{t('error.backendUnavailable')}</p>
      </div>
    </div>
  )
}

export function ProtectedRoute({ requiredRole }: { requiredRole?: 'admin' | 'member' }) {
  const { authErrorCode, isLoading, user } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
        <div className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm text-[var(--muted-foreground)] shadow-sm backdrop-blur">
          {t('app.loadingWorkspace')}
        </div>
      </div>
    )
  }

  if (authErrorCode === 'backend_unreachable') {
    return <BackendUnavailableNotice />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/chat" replace />
  }

  return <Outlet />
}

export function PublicOnlyRoute({ children }: { children: ReactElement }) {
  const { authErrorCode, isLoading, user } = useAuth()
  const { t } = useI18n()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
        <div className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm text-[var(--muted-foreground)] shadow-sm backdrop-blur">
          {t('app.loading')}
        </div>
      </div>
    )
  }

  if (authErrorCode === 'backend_unreachable') {
    return <BackendUnavailableNotice />
  }

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return children
}
