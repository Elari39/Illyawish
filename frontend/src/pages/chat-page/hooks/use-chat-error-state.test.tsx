import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatErrorState } from './use-chat-error-state'

describe('useChatErrorState', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  async function setError(
    result: { current: ReturnType<typeof useChatErrorState> },
    value: string | null,
  ) {
    await act(async () => {
      result.current.setChatError(value)
      await Promise.resolve()
    })
  }

  it('keeps chat errors visible until they are cleared', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useChatErrorState())

    await setError(result, 'start model stream: error, status code: 404')

    expect(result.current.chatError?.message).toBe('start model stream: error, status code: 404')

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.chatError?.message).toBe('start model stream: error, status code: 404')
  })

  it('clears chat errors immediately when null is passed', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useChatErrorState())

    await setError(result, 'temporary failure')
    expect(result.current.chatError?.message).toBe('temporary failure')

    await setError(result, null)
    expect(result.current.chatError).toBeNull()

    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(result.current.chatError).toBeNull()
  })

  it('replaces the previous error when a new one is set', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useChatErrorState())

    await setError(result, 'first error')
    await setError(result, 'second error')

    expect(result.current.chatError?.message).toBe('second error')
  })
})
