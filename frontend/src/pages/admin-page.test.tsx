import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../components/auth/auth-context'
import { APP_LOCALE_STORAGE_KEY } from '../i18n/config'
import { LanguageSwitcher } from '../i18n/language-switcher'
import { adminApi } from '../lib/api'
import { TestProviders } from '../test/test-providers'
import type { AdminUser, AuditLog, WorkspacePolicy } from '../types/chat'
import { AdminPage } from './admin-page'

const users: AdminUser[] = [
  {
    id: 1,
    username: 'aria',
    role: 'admin',
    status: 'active',
    lastLoginAt: null,
    maxConversations: 12,
    maxAttachmentsPerMessage: 4,
    dailyMessageLimit: 48,
    createdAt: '2026-03-25T08:00:00Z',
    updatedAt: '2026-03-27T08:00:00Z',
  },
]

const auditLogs: AuditLog[] = [
  {
    id: 9,
    actorUsername: '',
    action: 'user.updated',
    targetType: 'user',
    targetId: '1',
    targetName: 'aria',
    summary: 'Updated account limits',
    createdAt: '2026-03-27T12:34:56Z',
  },
]

const workspacePolicy: WorkspacePolicy = {
  defaultUserRole: 'member',
  defaultUserMaxConversations: 20,
  defaultUserMaxAttachmentsPerMessage: 4,
  defaultUserDailyMessageLimit: 100,
}

const authValue: AuthContextValue = {
  user: {
    id: 99,
    username: 'elaina',
    role: 'admin',
    status: 'active',
    lastLoginAt: null,
  },
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  refreshUser: vi.fn(),
}

function renderAdminPage(initialLocale: string) {
  window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, initialLocale)

  return render(
    <AuthContext.Provider value={authValue}>
      <TestProviders initialEntries={['/admin']}>
        <LanguageSwitcher />
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/chat" element={<div>chat</div>} />
        </Routes>
      </TestProviders>
    </AuthContext.Provider>,
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(adminApi, 'listUsers').mockResolvedValue(users)
    vi.spyOn(adminApi, 'listAuditLogs').mockResolvedValue({
      logs: auditLogs,
      total: auditLogs.length,
    })
    vi.spyOn(adminApi, 'getWorkspacePolicy').mockResolvedValue(workspacePolicy)
    vi.spyOn(adminApi, 'createUser').mockResolvedValue(users[0])
    vi.spyOn(adminApi, 'updateUser').mockResolvedValue(users[0])
    vi.spyOn(adminApi, 'updateWorkspacePolicy').mockResolvedValue(workspacePolicy)
    vi.spyOn(adminApi, 'resetUserPassword').mockResolvedValue(users[0])
  })

  it('renders localized admin content and updates immediately when the locale changes', async () => {
    renderAdminPage('zh-CN')

    expect(await screen.findByRole('heading', { name: '管理控制台' })).toBeInTheDocument()
    expect(screen.getByText('管理用户、查看审计活动并设置工作区默认值。')).toBeInTheDocument()
    expect(await screen.findByText(/从未登录/)).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('管理员').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue('启用').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '审计日志' }))

    expect(screen.getByText('系统')).toBeInTheDocument()

    const zhTimestamp = new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(auditLogs[0].createdAt))
    expect(screen.getByText(zhTimestamp)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(await screen.findByRole('heading', { name: 'Admin Console' })).toBeInTheDocument()
    expect(screen.getByText('Manage users, review audit activity, and set workspace defaults.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Users' }))
    expect(await screen.findByText(/Never/)).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Admin').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue('Active').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Audit Logs' }))
    expect(screen.getByText('System')).toBeInTheDocument()

    const enTimestamp = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(auditLogs[0].createdAt))
    expect(screen.getByText(enTimestamp)).toBeInTheDocument()
  })

  it('resets a user password through the translated prompt dialog instead of window.prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    const resetPasswordSpy = vi.spyOn(adminApi, 'resetUserPassword')

    renderAdminPage('en-US')

    expect(await screen.findByRole('heading', { name: 'Admin Console' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(promptSpy).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Reset password for aria' })).toBeInTheDocument()

    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'moonlit-secret' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => {
      expect(resetPasswordSpy).toHaveBeenCalledWith(1, {
        newPassword: 'moonlit-secret',
      })
    })
  })
})
