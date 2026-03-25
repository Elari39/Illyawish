import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './components/auth/auth-provider'
import { useAuth } from './components/auth/use-auth'
import { ChatPage } from './pages/chat-page'
import { LoginPage } from './pages/login-page'
import { ProtectedRoute } from './routes/protected-route'

function PublicOnlyRoute({ children }: { children: ReactElement }) {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
        <div className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm text-[var(--muted-foreground)] shadow-sm backdrop-blur">
          Loading...
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
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  )
}
