import { useEffect, useState } from 'react'

import {
  DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  type ConfirmationState,
  type PromptState,
  type SettingsTab,
  type ToastState,
  type ToastVariant,
} from '../types'
import { readDesktopSidebarCollapsedPreference } from '../utils'

export function useChatUIState() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(
    () => readDesktopSidebarCollapsedPreference(),
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('chat')
  const [toasts, setToasts] = useState<ToastState[]>([])
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)

  useEffect(() => {
    window.localStorage.setItem(
      DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      JSON.stringify(isDesktopSidebarCollapsed),
    )
  }, [isDesktopSidebarCollapsed])

  function showToast(message: string, variant: ToastVariant = 'info') {
    const toastId = Date.now() + Math.random()
    setToasts((previous) => [...previous, { id: toastId, message, variant }])
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== toastId))
    }, 2800)
  }

  return {
    sidebarOpen,
    isDesktopSidebarCollapsed,
    isSettingsOpen,
    activeSettingsTab,
    toasts,
    confirmation,
    promptState,
    setSidebarOpen,
    setIsDesktopSidebarCollapsed,
    setIsSettingsOpen,
    setActiveSettingsTab,
    setToasts,
    setConfirmation,
    setPromptState,
    showToast,
  }
}
