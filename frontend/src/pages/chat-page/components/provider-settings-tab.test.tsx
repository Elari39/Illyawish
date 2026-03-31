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
          canReuseActiveAPIKey={false}
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
          canReuseActiveAPIKey={false}
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

  it('shows the active preset reuse hint for a new preset when available', () => {
    render(
      <TestProviders>
        <ProviderSettingsTab
          canReuseActiveAPIKey={true}
          editingProviderId={null}
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
            name: '',
            baseURL: 'https://secondary.example.com/v1',
            apiKey: '',
            models: ['model-b'],
            defaultModel: 'model-b',
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
            activePresetId: 7,
            currentSource: 'preset',
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

    expect(screen.getByLabelText(/^API key/i)).toHaveAttribute(
      'placeholder',
      'Leave blank to reuse the active preset key',
    )
    expect(
      screen.getByText(
        'Leave this blank to reuse the current active preset API key, or enter a new one to store a separate key.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps the new preset api key help unchanged when reuse is unavailable', () => {
    render(
      <TestProviders>
        <ProviderSettingsTab
          canReuseActiveAPIKey={false}
          editingProviderId={null}
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
            name: '',
            baseURL: 'https://secondary.example.com/v1',
            apiKey: '',
            models: ['model-b'],
            defaultModel: 'model-b',
            errors: createProviderFormErrors(),
          }}
          providerState={{
            presets: [],
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

    expect(screen.getByLabelText(/^API key/i)).toHaveAttribute(
      'placeholder',
      'sk-...',
    )
    expect(
      screen.getByText('Stored encrypted by the backend after saving.'),
    ).toBeInTheDocument()
  })

  it('uses isolated scroll regions for the preset list and editor layout', () => {
    render(
      <TestProviders>
        <ProviderSettingsTab
          canReuseActiveAPIKey={false}
          editingProviderId={null}
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
            name: '',
            baseURL: '',
            apiKey: '',
            models: [''],
            defaultModel: '',
            errors: createProviderFormErrors(),
          }}
          providerState={{
            presets: Array.from({ length: 15 }, (_, index) => ({
              id: index + 1,
              name: `Preset ${index + 1}`,
              baseURL: `https://provider-${index + 1}.example.com/v1`,
              hasApiKey: true,
              apiKeyHint: `sk-${index + 1}`,
              models: [`model-${index + 1}`],
              defaultModel: `model-${index + 1}`,
              isActive: index === 0,
              createdAt: '2026-03-26T00:00:00Z',
              updatedAt: '2026-03-26T00:00:00Z',
            })),
            activePresetId: 1,
            currentSource: 'preset',
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

    expect(screen.getByTestId('provider-settings-layout')).toHaveClass('min-h-0')
    expect(screen.getByTestId('provider-presets-column')).toHaveClass('min-h-0')
    expect(screen.getByTestId('provider-presets-list')).toHaveClass('overflow-y-auto')
    expect(screen.getByTestId('provider-editor-column')).toHaveClass('overflow-y-auto')
  })
})
