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
  attachmentRetentionDays: 30,
}

const usageStats = {
  totalUsers: 3,
  activeUsers: 2,
  recentUsers: 1,
  totalConversations: 12,
  totalMessages: 48,
  totalAttachments: 7,
  configuredProviderPresets: 3,
  activeProviderPresets: 2,
  activeProviderDistribution: [
    {
      name: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      userCount: 2,
    },
  ],
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
    vi.spyOn(adminApi, 'getUsageStats').mockResolvedValue(usageStats)
    vi.spyOn(adminApi, 'getWorkspacePolicy').mockResolvedValue(workspacePolicy)
    vi.spyOn(adminApi, 'createUser').mockResolvedValue(users[0])
    vi.spyOn(adminApi, 'updateUser').mockResolvedValue(users[0])
    vi.spyOn(adminApi, 'updateWorkspacePolicy').mockResolvedValue(workspacePolicy)
    vi.spyOn(adminApi, 'resetUserPassword').mockResolvedValue(users[0])
    vi.spyOn(adminApi, 'purgeAttachments').mockResolvedValue({ deletedCount: 1 })
  })

  it('renders localized admin content and updates immediately when the locale changes', async () => {
    renderAdminPage('zh-CN')

    expect(await screen.findByRole('heading', { name: '管理控制台' })).toBeInTheDocument()
    expect(screen.getByText('管理用户、查看审计活动并设置工作区默认值。')).toBeInTheDocument()
    const backToChatButton = screen.getByRole('button', { name: '返回聊天' })
    expect(backToChatButton.className).toContain('min-w-9')
    expect(backToChatButton.className).toContain('sm:px-4')
    expect(screen.getByText('返回聊天').className).toContain('max-sm:sr-only')

    const signOutButton = screen.getByRole('button', { name: '退出登录' })
    expect(signOutButton.className).toContain('min-w-9')
    expect(signOutButton.className).toContain('sm:px-4')
    expect(screen.getByText('退出登录').className).toContain('max-sm:sr-only')
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

  it('shows usage stats and applies audit log filters', async () => {
    const listAuditLogsSpy = vi.spyOn(adminApi, 'listAuditLogs')

    renderAdminPage('en-US')

    expect(await screen.findByRole('heading', { name: 'Admin Console' })).toBeInTheDocument()
    expect(screen.getByText('48')).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('2 users')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Audit Logs' }))

    fireEvent.change(screen.getByLabelText('Actor'), {
      target: { value: 'aria' },
    })
    fireEvent.change(screen.getByLabelText('Action'), {
      target: { value: 'admin.user_updated' },
    })
    fireEvent.change(screen.getByLabelText('Target type'), {
      target: { value: 'user' },
    })
    fireEvent.change(screen.getByLabelText('Date from'), {
      target: { value: '2026-03-01' },
    })
    fireEvent.change(screen.getByLabelText('Date to'), {
      target: { value: '2026-03-31' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))

    await waitFor(() => {
      expect(listAuditLogsSpy).toHaveBeenLastCalledWith({
        actor: 'aria',
        action: 'admin.user_updated',
        targetType: 'user',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
        limit: 100,
        offset: 0,
      })
    })
  })

  it('saves attachment retention days from the attachments tab', async () => {
    const updateWorkspacePolicySpy = vi.spyOn(adminApi, 'updateWorkspacePolicy')

    renderAdminPage('en-US')

    expect(await screen.findByRole('heading', { name: 'Admin Console' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Attachments' }))
    fireEvent.change(screen.getByLabelText('Attachment retention (days)'), {
      target: { value: '45' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save attachment policy' }))

    await waitFor(() => {
      expect(updateWorkspacePolicySpy).toHaveBeenLastCalledWith({
        defaultUserRole: 'member',
        defaultUserMaxConversations: 20,
        defaultUserMaxAttachmentsPerMessage: 4,
        defaultUserDailyMessageLimit: 100,
        attachmentRetentionDays: 45,
      })
    })
  })

  it('purges attachments for one user and the whole workspace through confirmations', async () => {
    const purgeAttachmentsSpy = vi.spyOn(adminApi, 'purgeAttachments')

    renderAdminPage('en-US')

    expect(await screen.findByRole('heading', { name: 'Admin Console' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Attachments' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete aria attachments' }))

    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete all attachments uploaded by aria. This cannot be undone.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete attachments' }))

    await waitFor(() => {
      expect(purgeAttachmentsSpy).toHaveBeenCalledWith({
        scope: 'user',
        userId: 1,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete all attachments' }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete every stored attachment for all users. This will break historical attachment links.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete all attachments' }))

    await waitFor(() => {
      expect(purgeAttachmentsSpy).toHaveBeenCalledWith({ scope: 'all' })
    })
  })

  it('keeps invalid create-user limits as raw text and blocks submission', async () => {
    const createUserSpy = vi.spyOn(adminApi, 'createUser')

    renderAdminPage('en-US')

    expect(await screen.findByRole('heading', { name: 'Admin Console' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'luna' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'moonlight123' },
    })

    const maxConversationsInput = screen.getByLabelText('Max conversations') as HTMLInputElement
    fireEvent.change(maxConversationsInput, {
      target: { value: '1e' },
    })

    expect(maxConversationsInput.value).toBe('1e')
    expect(screen.queryByDisplayValue('NaN')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => {
      expect(createUserSpy).not.toHaveBeenCalled()
    })
  })

  it('blocks saving workspace defaults when a limit is not a positive whole number', async () => {
    const updateWorkspacePolicySpy = vi.spyOn(adminApi, 'updateWorkspacePolicy')

    renderAdminPage('en-US')

    expect(await screen.findByRole('heading', { name: 'Admin Console' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Workspace Policy' }))
    const maxConversationsInput =
      screen.getByLabelText('Default max conversations') as HTMLInputElement
    fireEvent.change(maxConversationsInput, {
      target: { value: ' 5' },
    })

    expect(maxConversationsInput.value).toBe(' 5')
    fireEvent.click(screen.getByRole('button', { name: 'Save workspace policy' }))

    await waitFor(() => {
      expect(updateWorkspacePolicySpy).not.toHaveBeenCalled()
    })
  })
})
