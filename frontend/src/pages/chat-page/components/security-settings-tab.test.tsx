import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_LOCALE_STORAGE_KEY } from '../../../i18n/config'
import { TestProviders } from '../../../test/test-providers'
import { ApiError, ApiNetworkError } from '../../../lib/http'
import { SecuritySettingsTab } from './security-settings-tab'

const changePasswordMock = vi.fn()
const logoutAllMock = vi.fn()
const logoutMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('../../../components/auth/use-auth', () => ({
  useAuth: () => ({
    logout: logoutMock,
  }),
}))

vi.mock('../../../lib/api', () => ({
  authApi: {
    changePassword: (...args: unknown[]) => changePasswordMock(...args),
    logoutAll: (...args: unknown[]) => logoutAllMock(...args),
  },
  isNetworkError: (error: unknown) => error instanceof ApiNetworkError,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

describe('SecuritySettingsTab', () => {
  beforeEach(() => {
    changePasswordMock.mockReset()
    logoutAllMock.mockReset()
    logoutMock.mockReset()
    navigateMock.mockReset()
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'zh-CN')
  })

  it('renders localized security copy instead of hard-coded english', async () => {
    render(
      <TestProviders>
        <SecuritySettingsTab />
      </TestProviders>,
    )

    expect(await screen.findByRole('heading', { name: '修改密码' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '会话安全' })).toBeInTheDocument()
    expect(screen.getByLabelText('当前密码')).toBeInTheDocument()
    expect(screen.getByLabelText('新密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新密码' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出全部会话' })).toBeInTheDocument()
    expect(screen.queryByText('Change password')).not.toBeInTheDocument()
    expect(screen.queryByText('Session security')).not.toBeInTheDocument()
    expect(screen.queryByText('Log out all sessions')).not.toBeInTheDocument()
  })

  it('shows a localized success message after changing the password', async () => {
    changePasswordMock.mockResolvedValue({ ok: true })

    render(
      <TestProviders>
        <SecuritySettingsTab />
      </TestProviders>,
    )

    fireEvent.change(await screen.findByLabelText('当前密码'), {
      target: { value: 'old-secret' },
    })
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'brand-new-secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: '更新密码' }))

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: 'old-secret',
        newPassword: 'brand-new-secret',
      })
    })

    expect(await screen.findByText('密码已更新。')).toBeInTheDocument()
  })

  it('translates known change-password errors instead of exposing backend english', async () => {
    changePasswordMock.mockRejectedValue(
      new ApiError('current password is incorrect', 401, 'validation_failed'),
    )

    render(
      <TestProviders>
        <SecuritySettingsTab />
      </TestProviders>,
    )

    fireEvent.change(await screen.findByLabelText('当前密码'), {
      target: { value: 'wrong-password' },
    })
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'brand-new-secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: '更新密码' }))

    expect(await screen.findByText('当前密码不正确。')).toBeInTheDocument()
    expect(screen.queryByText('current password is incorrect')).not.toBeInTheDocument()
  })

  it('shows the loading label while revoking all sessions', async () => {
    logoutAllMock.mockImplementation(
      () => new Promise(() => {}),
    )

    render(
      <TestProviders>
        <SecuritySettingsTab />
      </TestProviders>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '退出全部会话' }))

    expect(await screen.findByRole('button', { name: '加载中...' })).toBeDisabled()
  })

  it('translates backend unreachable errors for the security panel', async () => {
    changePasswordMock.mockRejectedValue(
      new ApiNetworkError('Unable to reach the backend service.'),
    )

    render(
      <TestProviders>
        <SecuritySettingsTab />
      </TestProviders>,
    )

    fireEvent.change(await screen.findByLabelText('当前密码'), {
      target: { value: 'old-secret' },
    })
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'brand-new-secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: '更新密码' }))

    expect(
      await screen.findByText('暂时无法连接后端服务，请确认 Go 服务已经启动。'),
    ).toBeInTheDocument()
  })
})
