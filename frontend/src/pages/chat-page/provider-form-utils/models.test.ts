import { describe, expect, it } from 'vitest'

import {
  normalizeModelEntries,
  resolveDefaultModelValue,
  resolveProviderModelDraft,
} from './models'

describe('provider form model helpers', () => {
  it('normalizes models by trimming and deduplicating empty values', () => {
    expect(normalizeModelEntries([' gpt-4.1 ', '', 'gpt-4.1', 'gpt-4.1-mini'])).toEqual([
      'gpt-4.1',
      'gpt-4.1-mini',
    ])
  })

  it('keeps the current default model when it still exists', () => {
    expect(resolveDefaultModelValue(['gpt-4.1', 'gpt-4.1-mini'], 'gpt-4.1-mini')).toBe(
      'gpt-4.1-mini',
    )
  })

  it('prepends the default model into the editable draft when missing', () => {
    expect(resolveProviderModelDraft(['gpt-4.1'], 'gpt-4.1-mini')).toEqual([
      'gpt-4.1-mini',
      'gpt-4.1',
    ])
  })
})
