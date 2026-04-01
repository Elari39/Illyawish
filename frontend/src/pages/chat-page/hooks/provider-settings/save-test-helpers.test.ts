import { describe, expect, it } from 'vitest'

import type { ProviderState } from '../../../../types/chat'
import type { ProviderEditorMode, ProviderFormState } from '../../types'
import {
  buildProviderSaveRequest,
  buildProviderTestRequest,
} from './save-test-helpers'

function createProviderForm(
  overrides: Partial<ProviderFormState> = {},
): ProviderFormState {
  return {
    name: 'OpenAI',
    format: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    models: ['gpt-4.1-mini'],
    defaultModel: 'gpt-4.1-mini',
    errors: {
      modelItems: [],
    },
    ...overrides,
  }
}

function createProviderState(
  overrides: Partial<ProviderState> = {},
): ProviderState {
  return {
    presets: [{
      id: 7,
      name: 'Primary',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    }],
    activePresetId: 7,
    currentSource: 'preset',
    fallback: {
      available: false,
      format: 'openai',
      baseURL: '',
      models: [],
      defaultModel: '',
    },
    ...overrides,
  }
}

describe('provider save/test helpers', () => {
  it('builds a create payload that reuses the active api key for a new preset', () => {
    expect(
      buildProviderSaveRequest({
        providerForm: createProviderForm({
          name: 'Secondary',
          baseURL: 'https://secondary.example.com/v1',
        }),
        providerEditorMode: { type: 'new' },
        providerState: createProviderState(),
        defaultModel: 'gpt-4.1-mini',
      }),
    ).toEqual({
      mode: 'create',
      payload: {
        format: 'openai',
        name: 'Secondary',
        baseURL: 'https://secondary.example.com/v1',
        reuseActiveApiKey: true,
        models: ['gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
      },
    })
  })

  it('builds an update payload without resending an unchanged api key', () => {
    expect(
      buildProviderSaveRequest({
        providerForm: createProviderForm({
          apiKey: '   ',
          models: ['gpt-4.1-mini', ' gpt-4.1-mini ', 'gpt-4.1'],
        }),
        providerEditorMode: {
          type: 'edit',
          providerId: 7,
        } satisfies ProviderEditorMode,
        providerState: createProviderState(),
        defaultModel: 'gpt-4.1-mini',
      }),
    ).toEqual({
      mode: 'update',
      providerId: 7,
      payload: {
        format: 'openai',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        models: ['gpt-4.1-mini', 'gpt-4.1'],
        defaultModel: 'gpt-4.1-mini',
      },
    })
  })

  it('builds a test payload that includes provider id and a changed api key', () => {
    expect(
      buildProviderTestRequest({
        providerForm: createProviderForm({
          apiKey: 'sk-updated-5678',
        }),
        providerEditorMode: {
          type: 'edit',
          providerId: 7,
        } satisfies ProviderEditorMode,
        providerState: createProviderState(),
        defaultModel: 'gpt-4.1-mini',
      }),
    ).toEqual({
      providerId: 7,
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-updated-5678',
      defaultModel: 'gpt-4.1-mini',
    })
  })
})
