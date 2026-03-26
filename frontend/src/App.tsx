import {
  Suspense,
  lazy,
  type ReactElement,
} from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './components/auth/auth-provider'
import { I18nProvider } from './i18n/provider'
import { useI18n } from './i18n/use-i18n'
import { useAuth } from './components/auth/use-auth'
import { ProtectedRoute } from './routes/protected-route'

const ChatPage = lazy(async () => import('./pages/chat-page').then((module) => ({
  default: module.ChatPage,
})))
const LoginPage = lazy(async () => import('./pages/login-page').then((module) => ({
  default: module.LoginPage,
})))

function PublicOnlyRoute({ children }: { children: ReactElement }) {
  const { isLoading, user } = useAuth()
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

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return children
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicOnlyRoute>
                    <LoginPage />
                  </PublicOnlyRoute>
                }
              />
              <Route element={<ProtectedRoute />}>
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:conversationId" element={<ChatPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  )
}

function AppLoading() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
      <div className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm text-[var(--muted-foreground)] shadow-sm backdrop-blur">
        {t('app.loading')}
      </div>
    </div>
  )
}
