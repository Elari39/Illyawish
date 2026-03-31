import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
  ProviderState,
} from '../../../types/chat'
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
  contextWindowTurns: null,
}

const chatSettings: ChatSettings = {
  globalPrompt: 'Use global prompt',
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}

const conversation: Conversation = {
  id: '1',
  title: 'Imported conversation',
  isPinned: false,
  isArchived: false,
  folder: '',
  tags: [],
  settings,
  createdAt: '2026-03-26T00:00:00Z',
  updatedAt: '2026-03-26T00:00:00Z',
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
    const onProviderTabChange = vi.fn()

    render(
      <TestProviders>
        <SettingsPanel
          activeTab="chat"
          chatSettings={chatSettings}
          conversationFolder=""
          conversationTags=""
          showArchived={false}
          availableFolders={['Work']}
          availableTags={['planning']}
          selectedFolder={null}
          selectedTags={[]}
          editingProviderId={null}
          isLoadingProviders={false}
          isImporting={false}
          isOpen
          messageCount={2}
          selectedConversationIds={[]}
          selectionMode={false}
          isSaving={false}
          isSavingProvider={false}
          isTestingProvider={false}
          onActivateProvider={vi.fn()}
          onClose={onClose}
          onDeleteProvider={vi.fn()}
          onEditProvider={vi.fn()}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onProviderFieldChange={vi.fn()}
          onProviderModelsChange={vi.fn()}
          onProviderTabChange={onProviderTabChange}
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
          setChatSettings={vi.fn()}
          setConversationFolder={vi.fn()}
          setConversationTags={vi.fn()}
          onToggleArchived={vi.fn()}
          onSelectFolder={vi.fn()}
          onToggleTag={vi.fn()}
          onSetSelectionMode={vi.fn()}
          onBulkMoveToFolder={vi.fn()}
          onBulkAddTags={vi.fn()}
          onBulkRemoveTags={vi.fn()}
          setSettings={vi.fn()}
          transferConversation={conversation}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute(
      'aria-modal',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI Provider' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import / Export' })).toBeInTheDocument()
    expect(screen.getByLabelText('Global prompt')).toBeInTheDocument()
    expect(screen.getByLabelText('Session prompt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import / Export' }))
    expect(onProviderTabChange).toHaveBeenCalledWith('transfer')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the tab bar and footer visible when switching to the provider tab', () => {
    render(
      <TestProviders>
        <SettingsPanel
          activeTab="provider"
          chatSettings={chatSettings}
          conversationFolder=""
          conversationTags=""
          showArchived={false}
          availableFolders={['Work']}
          availableTags={['planning']}
          selectedFolder={null}
          selectedTags={[]}
          editingProviderId={null}
          isLoadingProviders={false}
          isImporting={false}
          isOpen
          messageCount={2}
          selectedConversationIds={[]}
          selectionMode={false}
          isSaving={false}
          isSavingProvider={false}
          isTestingProvider={false}
          onActivateProvider={vi.fn()}
          onClose={vi.fn()}
          onDeleteProvider={vi.fn()}
          onEditProvider={vi.fn()}
          onExport={vi.fn()}
          onImport={vi.fn()}
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
          providerState={{
            ...providerState,
            presets: Array.from({ length: 12 }, (_, index) => ({
              id: index + 1,
              name: `Provider ${index + 1}`,
              baseURL: `https://provider-${index + 1}.example.com/v1`,
              hasApiKey: true,
              apiKeyHint: `sk-${index + 1}`,
              models: [`model-${index + 1}`],
              defaultModel: `model-${index + 1}`,
              isActive: index === 0,
              createdAt: '2026-03-26T00:00:00Z',
              updatedAt: '2026-03-26T00:00:00Z',
            })),
          }}
          settings={settings}
          setChatSettings={vi.fn()}
          setConversationFolder={vi.fn()}
          setConversationTags={vi.fn()}
          onToggleArchived={vi.fn()}
          onSelectFolder={vi.fn()}
          onToggleTag={vi.fn()}
          onSetSelectionMode={vi.fn()}
          onBulkMoveToFolder={vi.fn()}
          onBulkAddTags={vi.fn()}
          onBulkRemoveTags={vi.fn()}
          setSettings={vi.fn()}
          transferConversation={conversation}
        />
      </TestProviders>,
    )

    expect(screen.getByTestId('settings-panel')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('settings-panel-tab-nav')).toHaveClass('shrink-0')
    expect(screen.getByTestId('settings-panel-body')).toHaveClass('min-h-0')
    expect(screen.getByTestId('settings-panel-footer')).toHaveClass('shrink-0')
    expect(screen.getByRole('button', { name: 'AI Provider' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create preset' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create preset' })).toBeEnabled()
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
