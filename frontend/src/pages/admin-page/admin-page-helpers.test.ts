import { describe, expect, it } from 'vitest'

import { parseOptionalPositiveInteger } from './admin-page-helpers'

describe('parseOptionalPositiveInteger', () => {
  it.each([
    ['', { isValid: true, value: null }],
    ['7', { isValid: true, value: 7 }],
    ['-', { isValid: false, value: null }],
    ['1e', { isValid: false, value: null }],
    [' 5', { isValid: false, value: null }],
  ])('parses %p as %o', (value, expected) => {
    expect(parseOptionalPositiveInteger(value)).toEqual(expected)
  })
})
