import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatUIState } from './use-chat-ui-state'

describe('useChatUIState', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  async function showToast(
    result: { current: ReturnType<typeof useChatUIState> },
    variant: 'success' | 'error' | 'info',
  ) {
    await act(async () => {
      result.current.showToast('Toast message', variant)
      await Promise.resolve()
    })
  }

  it('keeps error toasts visible for 15 seconds by default', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useChatUIState())

    await showToast(result, 'error')

    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(14000)
    })

    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  it('keeps success toasts on the short default duration', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useChatUIState())

    await showToast(result, 'success')

    act(() => {
      vi.advanceTimersByTime(2799)
    })

    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  it('pauses and resumes error toast countdowns', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T00:00:00Z'))

    const { result } = renderHook(() => useChatUIState())

    await showToast(result, 'error')

    const toastId = result.current.toasts[0]?.id
    expect(toastId).toBeDefined()

    act(() => {
      vi.advanceTimersByTime(5000)
      vi.setSystemTime(new Date('2026-03-31T00:00:05Z'))
      result.current.pauseToast(toastId!)
    })

    expect(result.current.toasts[0]?.isPaused).toBe(true)
    expect(result.current.toasts[0]?.remainingMs).toBe(10000)

    act(() => {
      vi.advanceTimersByTime(20000)
      vi.setSystemTime(new Date('2026-03-31T00:00:25Z'))
    })

    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      result.current.resumeToast(toastId!)
    })

    expect(result.current.toasts[0]?.isPaused).toBe(false)

    act(() => {
      vi.advanceTimersByTime(9999)
      vi.setSystemTime(new Date('2026-03-31T00:00:34.999Z'))
    })

    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(1)
      vi.setSystemTime(new Date('2026-03-31T00:00:35Z'))
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  it('dismisses toasts immediately when closed manually', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useChatUIState())

    await showToast(result, 'error')

    const toastId = result.current.toasts[0]?.id
    expect(toastId).toBeDefined()

    act(() => {
      result.current.dismissToast(toastId!)
      vi.runOnlyPendingTimers()
    })

    expect(result.current.toasts).toHaveLength(0)
  })
})
