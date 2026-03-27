import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import type { ProviderState } from '../../../types/chat'
import { createProviderFormErrors } from '../utils'
import { ProviderSettingsTab } from './provider-settings-tab'

describe('ProviderSettingsTab', () => {
  it('keeps preset edit, activate, and delete actions isolated', () => {
    const preset = {
      id: 7,
      name: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      hasApiKey: true,
      apiKeyHint: 'sk-1...2345',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      isActive: false,
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }
    const providerState: ProviderState = {
      presets: [preset],
      activePresetId: null,
      currentSource: 'none',
      fallback: {
        available: false,
        baseURL: '',
        models: [],
        defaultModel: '',
      },
    }
    const onActivateProvider = vi.fn()
    const onDeleteProvider = vi.fn()
    const onEditProvider = vi.fn()

    render(
      <TestProviders>
        <ProviderSettingsTab
          editingProviderId={null}
          isLoadingProviders={false}
          isSavingProvider={false}
          onActivateProvider={onActivateProvider}
          onDeleteProvider={onDeleteProvider}
          onEditProvider={onEditProvider}
          onProviderFieldChange={vi.fn()}
          onProviderModelsChange={vi.fn()}
          onResetProvider={vi.fn()}
          onStartNewProvider={vi.fn()}
          providerForm={{
            name: '',
            baseURL: '',
            apiKey: '',
            models: [''],
            defaultModel: '',
            errors: createProviderFormErrors(),
          }}
          providerState={providerState}
        />
      </TestProviders>,
    )

    expect(screen.getByText('Key: sk-1...2345')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /openai/i }))
    expect(onEditProvider).toHaveBeenCalledWith(preset)
    expect(onActivateProvider).not.toHaveBeenCalled()
    expect(onDeleteProvider).not.toHaveBeenCalled()

    onEditProvider.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Set active' }))
    expect(onActivateProvider).toHaveBeenCalledWith(7)
    expect(onEditProvider).not.toHaveBeenCalled()
    expect(onDeleteProvider).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDeleteProvider).toHaveBeenCalledWith(preset)
    expect(onEditProvider).not.toHaveBeenCalled()
  })

  it('keeps the edit form empty and shows the stored key hint', () => {
    render(
      <TestProviders>
        <ProviderSettingsTab
          editingProviderId={7}
          isLoadingProviders={false}
          isSavingProvider={false}
          onActivateProvider={vi.fn()}
          onDeleteProvider={vi.fn()}
          onEditProvider={vi.fn()}
          onProviderFieldChange={vi.fn()}
          onProviderModelsChange={vi.fn()}
          onResetProvider={vi.fn()}
          onStartNewProvider={vi.fn()}
          providerForm={{
            name: 'OpenAI',
            baseURL: 'https://api.openai.com/v1',
            apiKey: '',
            models: ['gpt-4.1-mini'],
            defaultModel: 'gpt-4.1-mini',
            errors: createProviderFormErrors(),
          }}
          providerState={{
            presets: [{
              id: 7,
              name: 'OpenAI',
              baseURL: 'https://api.openai.com/v1',
              hasApiKey: true,
              apiKeyHint: 'sk-1...2345',
              models: ['gpt-4.1-mini'],
              defaultModel: 'gpt-4.1-mini',
              isActive: true,
              createdAt: '2026-03-26T00:00:00Z',
              updatedAt: '2026-03-26T00:00:00Z',
            }],
            activePresetId: null,
            currentSource: 'none',
            fallback: {
              available: false,
              baseURL: '',
              models: [],
              defaultModel: '',
            },
          }}
        />
      </TestProviders>,
    )

    expect(
      screen.getByLabelText(/^API key/i),
    ).toHaveValue('')
    expect(screen.getByText('Stored key: sk-1...2345')).toBeInTheDocument()
  })
})
