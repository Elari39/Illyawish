import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { useI18n } from '../i18n/use-i18n'

export function ProtectedRoute() {
  const { isLoading, user } = useAuth()
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

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
