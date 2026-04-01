import { useEffect, useRef, useState } from 'react'

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
  const timeoutIdsRef = useRef<Map<number, number>>(new Map())
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

  useEffect(() => {
    const timeoutIds = timeoutIdsRef.current

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      timeoutIds.clear()
    }
  }, [])

  function clearToastTimeout(toastId: number) {
    const timeoutId = timeoutIdsRef.current.get(toastId)
    if (timeoutId == null) {
      return
    }

    window.clearTimeout(timeoutId)
    timeoutIdsRef.current.delete(toastId)
  }

  function dismissToast(toastId: number) {
    clearToastTimeout(toastId)
    setToasts((previous) => previous.filter((toast) => toast.id !== toastId))
  }

  function scheduleToastRemoval(toastId: number, durationMs: number) {
    clearToastTimeout(toastId)
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(toastId)
      setToasts((previous) => previous.filter((toast) => toast.id !== toastId))
    }, durationMs)
    timeoutIdsRef.current.set(toastId, timeoutId)
  }

  function showToast(message: string, variant: ToastVariant = 'info') {
    const durationMs = variant === 'error' ? 15000 : 2800
    const toastId = Date.now() + Math.random()
    const closeAt = Date.now() + durationMs
    setToasts((previous) => [
      ...previous,
      {
        id: toastId,
        message,
        variant,
        durationMs,
        remainingMs: durationMs,
        closeAt,
        isPaused: false,
      },
    ])
    scheduleToastRemoval(toastId, durationMs)
  }

  function pauseToast(toastId: number) {
    setToasts((previous) => previous.map((toast) => {
      if (toast.id !== toastId || toast.isPaused) {
        return toast
      }

      const remainingMs = Math.max((toast.closeAt ?? Date.now()) - Date.now(), 0)
      clearToastTimeout(toastId)

      return {
        ...toast,
        remainingMs,
        closeAt: undefined,
        isPaused: true,
      }
    }))
  }

  function resumeToast(toastId: number) {
    setToasts((previous) => previous.map((toast) => {
      if (toast.id !== toastId || !toast.isPaused) {
        return toast
      }

      const remainingMs = toast.remainingMs ?? toast.durationMs ?? 0
      const closeAt = Date.now() + remainingMs
      scheduleToastRemoval(toastId, remainingMs)

      return {
        ...toast,
        remainingMs,
        closeAt,
        isPaused: false,
      }
    }))
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
    dismissToast,
    pauseToast,
    resumeToast,
    showToast,
  }
}
