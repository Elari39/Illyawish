import { describe, expect, it } from 'vitest'

import { enUSMessages } from './en-US'
import { jaJPMessages } from './ja-JP'

describe('jaJPMessages', () => {
  it('includes every translation key from the English catalog', () => {
    expect(Object.keys(jaJPMessages).sort()).toEqual(
      Object.keys(enUSMessages).sort(),
    )
  })
})
