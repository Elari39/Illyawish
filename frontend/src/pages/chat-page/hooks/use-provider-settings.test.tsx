import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { I18nProvider } from '../../../i18n/provider'
import type { ProviderPreset, ProviderState } from '../../../types/chat'
import { useProviderSettings } from './use-provider-settings'

const listProvidersMock = vi.fn()
const createProviderMock = vi.fn()
const updateProviderMock = vi.fn()
const testProviderMock = vi.fn()

vi.mock('../../../lib/api', () => ({
  providerApi: {
    list: (...args: unknown[]) => listProvidersMock(...args),
    create: (...args: unknown[]) => createProviderMock(...args),
    update: (...args: unknown[]) => updateProviderMock(...args),
    activate: vi.fn(),
    delete: vi.fn(),
    test: (...args: unknown[]) => testProviderMock(...args),
  },
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
)

describe('useProviderSettings', () => {
  beforeEach(() => {
    listProvidersMock.mockReset()
    createProviderMock.mockReset()
    updateProviderMock.mockReset()
    testProviderMock.mockReset()
  })

  it('blocks save and test when required provider fields are missing', async () => {
    const setChatError = vi.fn()
    const showToast = vi.fn()

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: false,
          setChatError,
          showToast,
        }),
      { wrapper },
    )

    act(() => {
      result.current.handleProviderFieldChange('baseURL', '')
    })

    await act(async () => {
      await result.current.handleSaveProvider()
    })

    expect(createProviderMock).not.toHaveBeenCalled()
    expect(result.current.providerForm.errors.name).toBeTruthy()
    expect(result.current.providerForm.errors.baseURL).toBeTruthy()
    expect(result.current.providerForm.errors.apiKey).toBeTruthy()
    expect(result.current.providerForm.errors.models).toBeTruthy()

    await act(async () => {
      await result.current.handleTestProvider()
    })

    expect(testProviderMock).not.toHaveBeenCalled()
  })

  it('allows editing a preset without re-entering the api key', async () => {
    const preset: ProviderPreset = {
      id: 7,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    const nextState: ProviderState = {
      presets: [preset],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    }
    listProvidersMock.mockResolvedValue(nextState)
    updateProviderMock.mockResolvedValue(nextState)

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.providerState?.presets[0]?.id).toBe(7)
    })

    act(() => {
      result.current.handleEditProvider(preset)
    })

    await act(async () => {
      await result.current.handleSaveProvider()
    })

    expect(updateProviderMock).toHaveBeenCalledWith(7, {
      format: 'openai',
      name: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
    })
  })

  it('updates the auto-selected active preset instead of creating a new one', async () => {
    const preset: ProviderPreset = {
      id: 7,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    const nextState: ProviderState = {
      presets: [{
        ...preset,
        models: ['gpt-4.1-mini', 'gpt-4.1'],
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
    }
    listProvidersMock.mockResolvedValue({
      presets: [preset],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: nextState.fallback,
    } satisfies ProviderState)
    updateProviderMock.mockResolvedValue(nextState)

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.editingProviderId).toBe(7)
    })

    act(() => {
      result.current.handleProviderModelsChange({
        models: ['gpt-4.1-mini', 'gpt-4.1'],
        defaultModel: 'gpt-4.1-mini',
      })
    })

    await act(async () => {
      await result.current.handleSaveProvider()
    })

    expect(updateProviderMock).toHaveBeenCalledWith(7, {
      format: 'openai',
      name: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      models: ['gpt-4.1-mini', 'gpt-4.1'],
      defaultModel: 'gpt-4.1-mini',
    })
    expect(createProviderMock).not.toHaveBeenCalled()
  })

  it('tests the auto-selected active preset as an existing preset', async () => {
    const preset: ProviderPreset = {
      id: 7,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    listProvidersMock.mockResolvedValue({
      presets: [preset],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    } satisfies ProviderState)
    testProviderMock.mockResolvedValue({
      ok: true,
      message: 'provider connection verified',
      resolvedBaseURL: 'https://api.openai.com/v1',
      resolvedModel: 'gpt-4.1-mini',
    })

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.editingProviderId).toBe(7)
    })

    await act(async () => {
      await result.current.handleTestProvider()
    })

    expect(testProviderMock).toHaveBeenCalledWith({
      providerId: 7,
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4.1-mini',
    })
  })

  it('keeps the created preset api key visible after saving a new preset', async () => {
    const setChatError = vi.fn()
    const showToast = vi.fn()
    const createdPreset: ProviderPreset = {
      id: 9,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-c...9876',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    createProviderMock.mockResolvedValue({
      presets: [createdPreset],
      activePresetId: 9,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    } satisfies ProviderState)

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: false,
          setChatError,
          showToast,
        }),
      { wrapper },
    )

    act(() => {
      result.current.handleProviderFieldChange('name', 'OpenAI')
      result.current.handleProviderFieldChange('baseURL', 'https://api.openai.com/v1')
      result.current.handleProviderFieldChange('apiKey', 'sk-created-9876')
      result.current.handleProviderModelsChange({
        models: ['gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
      })
    })

    await act(async () => {
      await result.current.handleSaveProvider()
    })

    expect(createProviderMock).toHaveBeenCalledWith({
      format: 'openai',
      name: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-created-9876',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
    })
    expect(result.current.editingProviderId).toBe(9)
    expect(result.current.providerForm.apiKey).toBe('')
    expect(result.current.providerState?.presets[0]?.hasApiKey).toBe(true)
  })

  it('reuses the active preset api key when saving a new preset without entering one', async () => {
    const activePreset: ProviderPreset = {
      id: 7,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    listProvidersMock.mockResolvedValue({
      presets: [activePreset],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    } satisfies ProviderState)
    createProviderMock.mockResolvedValue({
      presets: [
        {
          ...activePreset,
          id: 8,
          name: 'Secondary',
          format: 'anthropic',
          baseURL: 'https://secondary.example.com/v1',
          models: ['model-b'],
          defaultModel: 'model-b',
        },
        {
          ...activePreset,
          isActive: false,
        },
      ],
      activePresetId: 8,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    } satisfies ProviderState)

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.providerState?.activePresetId).toBe(7)
    })

    act(() => {
      result.current.handleStartNewProvider()
      result.current.handleProviderFieldChange('name', 'Secondary')
      result.current.handleProviderFieldChange('baseURL', 'https://secondary.example.com/v1')
      result.current.handleProviderModelsChange({
        models: ['model-b'],
        defaultModel: 'model-b',
      })
    })

    await act(async () => {
      await result.current.handleSaveProvider()
    })

    expect(createProviderMock).toHaveBeenCalledWith({
      format: 'openai',
      name: 'Secondary',
      baseURL: 'https://secondary.example.com/v1',
      reuseActiveApiKey: true,
      models: ['model-b'],
      defaultModel: 'model-b',
    })
    expect(result.current.providerForm.errors.apiKey).toBeUndefined()
  })

  it('defaults a new preset to openai format and default base url', () => {
    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: false,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    expect(result.current.providerForm.format).toBe('openai')
    expect(result.current.providerForm.baseURL).toBe('https://api.openai.com/v1')
  })

  it('switches to the selected format default base url when the current base url is still default', () => {
    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: false,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    act(() => {
      result.current.handleProviderFieldChange('format', 'anthropic')
    })

    expect(result.current.providerForm.format).toBe('anthropic')
    expect(result.current.providerForm.baseURL).toBe('https://api.anthropic.com/v1')
  })

  it('does not overwrite a custom base url when switching formats', () => {
    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: false,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    act(() => {
      result.current.handleProviderFieldChange('baseURL', 'https://gateway.example.com/v1')
      result.current.handleProviderFieldChange('format', 'gemini')
    })

    expect(result.current.providerForm.baseURL).toBe('https://gateway.example.com/v1')
    expect(result.current.providerForm.format).toBe('gemini')
  })

  it('requires an api key for a new preset when no active preset key can be reused', async () => {
    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: false,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    act(() => {
      result.current.handleProviderFieldChange('name', 'Secondary')
      result.current.handleProviderFieldChange('baseURL', 'https://secondary.example.com/v1')
      result.current.handleProviderModelsChange({
        models: ['model-b'],
        defaultModel: 'model-b',
      })
    })

    await act(async () => {
      await result.current.handleSaveProvider()
    })

    expect(createProviderMock).not.toHaveBeenCalled()
    expect(result.current.providerForm.errors.apiKey).toBeTruthy()
  })

  it('keeps the new preset form when the initial provider request finishes later', async () => {
    const providerState: ProviderState = {
      presets: [
        {
          id: 3,
          name: 'Existing preset',
          format: 'openai',
          baseURL: 'https://api.openai.com/v1',
          hasApiKey: true,
          apiKeyHint: 'sk-1...2345',
          models: ['gpt-4.1-mini'],
          defaultModel: 'gpt-4.1-mini',
          isActive: true,
          createdAt: '2026-03-26T00:00:00Z',
          updatedAt: '2026-03-26T00:00:00Z',
        },
      ],
      activePresetId: 3,
      currentSource: 'preset',
      fallback: {
        available: true,
        format: 'openai',
        baseURL: 'https://fallback.example.com/v1',
        models: ['fallback-model'],
        defaultModel: 'fallback-model',
      },
    }
    let resolveListRequest: ((value: ProviderState) => void) | null = null

    listProvidersMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListRequest = resolve
        }),
    )

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(listProvidersMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.handleStartNewProvider()
    })

    expect(result.current.editingProviderId).toBeNull()
    expect(result.current.providerForm.name).toBe('')

    await act(async () => {
      resolveListRequest?.(providerState)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.isLoadingProviders).toBe(false)
    })

    expect(result.current.editingProviderId).toBeNull()
    expect(result.current.providerForm.name).toBe('')
    expect(result.current.providerForm.baseURL).toBe(
      'https://fallback.example.com/v1',
    )
    expect(result.current.providerForm.defaultModel).toBe('fallback-model')
  })

  it('does not resend an unchanged api key when testing an existing preset', async () => {
    const preset: ProviderPreset = {
      id: 7,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    listProvidersMock.mockResolvedValue({
      presets: [preset],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    } satisfies ProviderState)
    testProviderMock.mockResolvedValue({
      ok: true,
      message: 'provider connection verified',
      resolvedBaseURL: 'https://api.openai.com/v1',
      resolvedModel: 'gpt-4.1-mini',
    })

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.providerState?.presets[0]?.id).toBe(7)
    })

    act(() => {
      result.current.handleEditProvider(preset)
    })

    await act(async () => {
      await result.current.handleTestProvider()
    })

    expect(testProviderMock).toHaveBeenCalledWith({
      providerId: 7,
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4.1-mini',
    })
  })

  it('resends a changed api key when testing an existing preset', async () => {
    const preset: ProviderPreset = {
      id: 7,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    listProvidersMock.mockResolvedValue({
      presets: [preset],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    } satisfies ProviderState)
    testProviderMock.mockResolvedValue({
      ok: true,
      message: 'provider connection verified',
      resolvedBaseURL: 'https://api.openai.com/v1',
      resolvedModel: 'gpt-4.1-mini',
    })

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.providerState?.presets[0]?.id).toBe(7)
    })

    act(() => {
      result.current.handleEditProvider(preset)
      result.current.handleProviderFieldChange('apiKey', 'sk-updated-5678')
    })

    await act(async () => {
      await result.current.handleTestProvider()
    })

    expect(testProviderMock).toHaveBeenCalledWith({
      providerId: 7,
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-updated-5678',
      defaultModel: 'gpt-4.1-mini',
    })
  })

  it('reuses the active preset api key when testing a new preset without entering one', async () => {
    const activePreset: ProviderPreset = {
      id: 7,
      name: 'OpenAI',
      format: 'openai',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: true,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    listProvidersMock.mockResolvedValue({
      presets: [activePreset],
      activePresetId: 7,
      currentSource: 'preset',
      fallback: {
        available: false,
        format: 'openai',
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    } satisfies ProviderState)
    testProviderMock.mockResolvedValue({
      ok: true,
      message: 'provider connection verified',
      resolvedBaseURL: 'https://secondary.example.com/v1',
      resolvedModel: 'model-b',
    })

    const { result } = renderHook(
      () =>
        useProviderSettings({
          isSettingsOpen: true,
          setChatError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.providerState?.activePresetId).toBe(7)
    })

    act(() => {
      result.current.handleStartNewProvider()
      result.current.handleProviderFieldChange('name', 'Secondary')
      result.current.handleProviderFieldChange('baseURL', 'https://secondary.example.com/v1')
      result.current.handleProviderModelsChange({
        models: ['model-b'],
        defaultModel: 'model-b',
      })
    })

    await act(async () => {
      await result.current.handleTestProvider()
    })

    expect(testProviderMock).toHaveBeenCalledWith({
      format: 'openai',
      baseURL: 'https://secondary.example.com/v1',
      reuseActiveApiKey: true,
      defaultModel: 'model-b',
    })
  })
})
