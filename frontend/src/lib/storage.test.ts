import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  readLocalStorage,
  readSessionStorage,
  removeLocalStorage,
  writeLocalStorage,
  writeSessionStorage,
} from './storage'

describe('storage helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('returns null when localStorage reads fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(readLocalStorage('test-key')).toBeNull()
  })

  it('returns false when localStorage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(writeLocalStorage('test-key', 'value')).toBe(false)
  })

  it('returns false when localStorage removes fail', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(removeLocalStorage('test-key')).toBe(false)
  })

  it('returns safe defaults when sessionStorage access fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(readSessionStorage('test-key')).toBeNull()
    expect(writeSessionStorage('test-key', 'value')).toBe(false)
  })

  it('returns safe defaults when window is unavailable', () => {
    const originalWindow = globalThis.window

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(readLocalStorage('missing-window')).toBeNull()
      expect(writeLocalStorage('missing-window', 'value')).toBe(false)
      expect(removeLocalStorage('missing-window')).toBe(false)
      expect(readSessionStorage('missing-window')).toBeNull()
      expect(writeSessionStorage('missing-window', 'value')).toBe(false)
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    }
  })

  it('reads and writes storage values when storage is available', () => {
    expect(writeLocalStorage('local-key', 'local-value')).toBe(true)
    expect(readLocalStorage('local-key')).toBe('local-value')
    expect(removeLocalStorage('local-key')).toBe(true)
    expect(readLocalStorage('local-key')).toBeNull()

    expect(writeSessionStorage('session-key', 'session-value')).toBe(true)
    expect(readSessionStorage('session-key')).toBe('session-value')
  })
})
