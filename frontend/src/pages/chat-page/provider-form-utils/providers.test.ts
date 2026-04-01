import { describe, expect, it } from 'vitest'

import {
  canReuseActivePresetAPIKey,
  createProviderForm,
  defaultBaseURLForProviderFormat,
  normalizeProviderFormat,
} from './providers'

describe('provider form provider helpers', () => {
  it('normalizes unknown provider formats back to openai', () => {
    expect(normalizeProviderFormat('custom')).toBe('openai')
    expect(normalizeProviderFormat('anthropic')).toBe('anthropic')
  })

  it('builds a new provider form from fallback defaults', () => {
    expect(
      createProviderForm({
        available: true,
        format: 'gemini',
        baseURL: 'https://example.com/v1',
        models: ['gemini-2.5-flash'],
        defaultModel: 'gemini-2.5-flash',
      }),
    ).toMatchObject({
      format: 'gemini',
      baseURL: 'https://example.com/v1',
      models: ['gemini-2.5-flash'],
      defaultModel: 'gemini-2.5-flash',
    })
  })

  it('detects when the active preset api key can be reused', () => {
    expect(
      canReuseActivePresetAPIKey({
        activePresetId: 2,
        currentSource: 'preset',
        fallback: {
          available: true,
          baseURL: defaultBaseURLForProviderFormat('openai'),
          models: [],
          defaultModel: '',
        },
        presets: [
          {
            id: 2,
            name: 'OpenAI',
            format: 'openai',
            baseURL: 'https://api.openai.com/v1',
            hasApiKey: true,
            apiKeyHint: 'sk-...1234',
            models: ['gpt-4.1-mini'],
            defaultModel: 'gpt-4.1-mini',
            isActive: true,
            createdAt: '2026-03-26T00:00:00Z',
            updatedAt: '2026-03-26T00:00:00Z',
          },
        ],
      }),
    ).toBe(true)
  })
})
