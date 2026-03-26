import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import type { ConversationSettings, ProviderState } from '../../../types/chat'
import { TestProviders } from '../../../test/test-providers'
import { createProviderFormErrors } from '../utils'
import { ConfirmationDialog } from './confirmation-dialog'
import { PromptDialog } from './prompt-dialog'
import { SettingsPanel } from './settings-panel'
import { ToastViewport } from './toast-viewport'

const settings: ConversationSettings = {
  systemPrompt: 'You are a helpful assistant.',
  model: '',
  temperature: 1,
  maxTokens: null,
}

const providerState: ProviderState = {
  presets: [],
  activePresetId: null,
  currentSource: 'none',
  fallback: {
    available: false,
    baseURL: '',
    models: [],
    defaultModel: '',
  },
}

describe('overlay accessibility', () => {
  it('renders the settings panel as a dismissible dialog', () => {
    const onClose = vi.fn()

    render(
      <TestProviders>
        <SettingsPanel
          activeTab="chat"
          editingProviderId={null}
          isLoadingProviders={false}
          isOpen
          isSaving={false}
          isSavingProvider={false}
          isTestingProvider={false}
          onActivateProvider={vi.fn()}
          onClose={onClose}
          onDeleteProvider={vi.fn()}
          onEditProvider={vi.fn()}
          onProviderFieldChange={vi.fn()}
          onProviderModelsChange={vi.fn()}
          onProviderTabChange={vi.fn()}
          onReset={vi.fn()}
          onResetProvider={vi.fn()}
          onSave={vi.fn()}
          onSaveProvider={vi.fn()}
          onStartNewProvider={vi.fn()}
          onTestProvider={vi.fn()}
          providerForm={{
            name: '',
            baseURL: '',
            apiKey: '',
            models: [''],
            defaultModel: '',
            errors: createProviderFormErrors(),
          }}
          providerState={providerState}
          settings={settings}
          setSettings={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute(
      'aria-modal',
      'true',
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('supports dismissing the confirmation and prompt dialogs via Escape or backdrop', () => {
    const onCloseConfirmation = vi.fn()
    const onClosePrompt = vi.fn()

    const { rerender } = render(
      <TestProviders>
        <ConfirmationDialog
          confirmation={{
            title: 'Delete conversation',
            confirmLabel: 'Delete',
            onConfirm: vi.fn(),
          }}
          onClose={onCloseConfirmation}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('dialog', { name: 'Delete conversation' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseConfirmation).toHaveBeenCalledTimes(1)

    rerender(
      <TestProviders>
        <PromptDialog
          onClose={onClosePrompt}
          promptState={{
            title: 'Rename conversation',
            initialValue: 'Draft',
            confirmLabel: 'Save',
            onSubmit: vi.fn(),
          }}
        />
      </TestProviders>,
    )

    const promptDialog = screen.getByRole('dialog', { name: 'Rename conversation' })
    fireEvent.mouseDown(promptDialog.parentElement!)
    expect(onClosePrompt).toHaveBeenCalledTimes(1)
  })

  it('announces toast notifications and exposes a close button label', () => {
    const onDismiss = vi.fn()

    render(
      <TestProviders>
        <ToastViewport
          onDismiss={onDismiss}
          toasts={[
            {
              id: 1,
              message: 'Saved successfully',
              variant: 'success',
            },
          ]}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('region')).toHaveAttribute('aria-live', 'polite')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalledWith(1)
  })
})
