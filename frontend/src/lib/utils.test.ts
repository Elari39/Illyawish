import { describe, expect, it } from 'vitest'

import { formatDateTime } from './utils'

describe('lib utils', () => {
  it('formats date-time values with the active locale using a shared medium-date short-time style', () => {
    const value = '2026-03-27T12:34:56Z'
    const expected = new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))

    expect(formatDateTime(value, 'ja-JP')).toBe(expected)
  })

  it('returns an empty string for invalid date-time values', () => {
    expect(formatDateTime('not-a-date', 'en-US')).toBe('')
  })
})
