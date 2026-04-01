import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'

import type {
  ChatSettings,
  ConversationSettings,
  ProviderState,
} from '../../../types/chat'
import { TestProviders } from '../../../test/test-providers'
import { createProviderFormErrors } from '../utils'
import { SettingsPanel } from './settings-panel'

const initialChatSettings: ChatSettings = {
  globalPrompt: '',
  providerPresetId: null,
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}

const initialSettings: ConversationSettings = {
  systemPrompt: '',
  providerPresetId: null,
  model: '',
  temperature: null,
  maxTokens: null,
  contextWindowTurns: null,
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

const historyHandlers = {
  onToggleArchived: vi.fn(),
  onSelectFolder: vi.fn(),
  onToggleTag: vi.fn(),
  onSetSelectionMode: vi.fn(),
  onBulkMoveToFolder: vi.fn(),
  onBulkAddTags: vi.fn(),
  onBulkRemoveTags: vi.fn(),
}

function ProviderSettingsHarness() {
  const [chatSettings, setChatSettings] = useState(initialChatSettings)
  const [conversationFolder, setConversationFolder] = useState('')
  const [conversationTags, setConversationTags] = useState('')
  const [settings, setSettings] = useState(initialSettings)
  const [providerForm, setProviderForm] = useState({
    name: '',
    format: 'openai' as const,
    baseURL: '',
    apiKey: '',
    models: [''],
    defaultModel: '',
    errors: createProviderFormErrors(),
  })

  return (
    <SettingsPanel
      activeTab="provider"
      chatSettings={chatSettings}
      conversationFolder={conversationFolder}
      conversationTags={conversationTags}
      showArchived={false}
      availableFolders={['Work']}
      availableTags={['planning']}
      selectedFolder={null}
      selectedTags={[]}
      editingProviderId={null}
      isLoadingProviders={false}
      isImporting={false}
      isOpen
      messageCount={0}
      selectedConversationIds={[]}
      selectionMode={false}
      isSaving={false}
      isSavingProvider={false}
      isTestingProvider={false}
      onActivateProvider={() => {}}
      onClose={() => {}}
      onDeleteProvider={() => {}}
      onEditProvider={() => {}}
      onExport={() => {}}
      onImport={() => {}}
      onProviderFieldChange={(field, value) => {
        setProviderForm((previous) => ({
          ...previous,
          [field]: value,
        }))
      }}
      onProviderModelsChange={({ models, defaultModel }) => {
        setProviderForm((previous) => ({
          ...previous,
          models,
          defaultModel,
        }))
      }}
      {...historyHandlers}
      onProviderTabChange={() => {}}
      onReset={() => {}}
      onResetProvider={() => {}}
      onSave={() => {}}
      onSaveProvider={() => {}}
      onStartNewProvider={() => {}}
      onTestProvider={() => {}}
      providerForm={providerForm}
      providerState={providerState}
      settings={settings}
      setChatSettings={setChatSettings}
      setConversationFolder={setConversationFolder}
      setConversationTags={setConversationTags}
      setSettings={setSettings}
      transferConversation={null}
    />
  )
}

function ChatSettingsHarness() {
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    ...initialChatSettings,
    providerPresetId: 7,
    model: 'gpt-4.1-mini',
  })
  const [conversationFolder, setConversationFolder] = useState('')
  const [conversationTags, setConversationTags] = useState('')
  const [settings, setSettings] = useState(initialSettings)

  return (
    <SettingsPanel
      activeTab="chat"
      chatSettings={chatSettings}
      conversationFolder={conversationFolder}
      conversationTags={conversationTags}
      showArchived={false}
      availableFolders={['Work']}
      availableTags={['planning']}
      selectedFolder={null}
      selectedTags={[]}
      editingProviderId={null}
      isLoadingProviders={false}
      isImporting={false}
      isOpen
      messageCount={0}
      selectedConversationIds={[]}
      selectionMode={false}
      isSaving={false}
      isSavingProvider={false}
      isTestingProvider={false}
      onActivateProvider={() => {}}
      onClose={() => {}}
      onDeleteProvider={() => {}}
      onEditProvider={() => {}}
      onExport={() => {}}
      onImport={() => {}}
      onProviderFieldChange={() => {}}
      onProviderModelsChange={() => {}}
      {...historyHandlers}
      onProviderTabChange={() => {}}
      onReset={() => {}}
      onResetProvider={() => {}}
      onSave={() => {}}
      onSaveProvider={() => {}}
      onStartNewProvider={() => {}}
      onTestProvider={() => {}}
      providerForm={{
        name: '',
        format: 'openai',
        baseURL: '',
        apiKey: '',
        models: [''],
        defaultModel: '',
        errors: createProviderFormErrors(),
      }}
      providerState={{
        ...providerState,
        presets: [
          {
            id: 7,
            name: 'OpenAI',
            format: 'openai',
            baseURL: 'https://api.openai.com/v1',
            hasApiKey: true,
            apiKeyHint: 'sk-***',
            models: ['gpt-4.1-mini', 'gpt-4.1'],
            defaultModel: 'gpt-4.1-mini',
            isActive: true,
            createdAt: '2026-03-26T00:00:00Z',
            updatedAt: '2026-03-26T00:00:00Z',
          },
        ],
        activePresetId: 7,
        currentSource: 'preset',
      }}
      settings={settings}
      setChatSettings={setChatSettings}
      setConversationFolder={setConversationFolder}
      setConversationTags={setConversationTags}
      setSettings={setSettings}
      transferConversation={null}
    />
  )
}

function HistorySettingsHarness() {
  const [chatSettings, setChatSettings] = useState(initialChatSettings)
  const [conversationFolder, setConversationFolder] = useState('')
  const [conversationTags, setConversationTags] = useState('')
  const [settings, setSettings] = useState(initialSettings)

  return (
    <SettingsPanel
      activeTab="history"
      chatSettings={chatSettings}
      conversationFolder={conversationFolder}
      conversationTags={conversationTags}
      showArchived={false}
      availableFolders={['Work']}
      availableTags={['planning']}
      selectedFolder={null}
      selectedTags={[]}
      editingProviderId={null}
      isLoadingProviders={false}
      isImporting={false}
      isOpen
      messageCount={0}
      selectedConversationIds={['1', '2']}
      selectionMode
      isSaving={false}
      isSavingProvider={false}
      isTestingProvider={false}
      onActivateProvider={() => {}}
      onClose={() => {}}
      onDeleteProvider={() => {}}
      onEditProvider={() => {}}
      onExport={() => {}}
      onImport={() => {}}
      onProviderFieldChange={() => {}}
      onProviderModelsChange={() => {}}
      {...historyHandlers}
      onProviderTabChange={() => {}}
      onReset={() => {}}
      onResetProvider={() => {}}
      onSave={() => {}}
      onSaveProvider={() => {}}
      onStartNewProvider={() => {}}
      onTestProvider={() => {}}
      providerForm={{
        name: '',
        format: 'openai',
        baseURL: '',
        apiKey: '',
        models: [''],
        defaultModel: '',
        errors: createProviderFormErrors(),
      }}
      providerState={providerState}
      settings={settings}
      setChatSettings={setChatSettings}
      setConversationFolder={setConversationFolder}
      setConversationTags={setConversationTags}
      setSettings={setSettings}
      transferConversation={null}
    />
  )
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('focuses the close button when the panel opens', () => {
    render(
      <TestProviders>
        <ProviderSettingsHarness />
      </TestProviders>,
    )

    expect(screen.getByLabelText('Close')).toHaveFocus()
  })

  it('keeps provider inputs focused while typing through rerenders', () => {
    render(
      <TestProviders>
        <ProviderSettingsHarness />
      </TestProviders>,
    )

    const closeButton = screen.getByLabelText('Close')
    const nameInput = screen.getByRole('textbox', { name: 'Preset name' })
    nameInput.focus()
    fireEvent.change(nameInput, {
      target: { value: 'My provider' },
    })
    expect(nameInput).toHaveFocus()
    expect(closeButton).not.toHaveFocus()

    const modelInput = screen.getByPlaceholderText('gpt-4.1-mini')
    modelInput.focus()
    fireEvent.change(modelInput, {
      target: { value: 'gpt-4.1-mini' },
    })
    expect(modelInput).toHaveFocus()

    const baseURLInput = screen.getByRole('textbox', { name: 'Base URL' })
    baseURLInput.focus()
    fireEvent.change(baseURLInput, {
      target: { value: 'https://api.openai.com/v1' },
    })
    expect(baseURLInput).toHaveFocus()

    const apiKeyInput = screen.getByLabelText(/^API key/i)
    apiKeyInput.focus()
    fireEvent.change(apiKeyInput, {
      target: { value: 'sk-test' },
    })
    expect(apiKeyInput).toHaveFocus()
  })

  it('renders provider and model controls for global chat defaults', () => {
    render(
      <TestProviders>
        <ChatSettingsHarness />
      </TestProviders>,
    )

    expect(screen.getByLabelText('Provider')).toBeInTheDocument()
    expect(screen.getByLabelText('Model')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'gpt-4.1-mini' }),
    ).toBeInTheDocument()
  })

  it('exposes a dedicated history tab in settings', () => {
    render(
      <TestProviders>
        <HistorySettingsHarness />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText('History view')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archived' })).toBeInTheDocument()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('routes history filter and bulk action controls through the existing handlers', () => {
    render(
      <TestProviders>
        <HistorySettingsHarness />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    fireEvent.click(screen.getByRole('button', { name: 'planning' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add tags to selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove tags from selected' }))

    expect(historyHandlers.onToggleArchived).toHaveBeenCalledWith(true)
    expect(historyHandlers.onSelectFolder).toHaveBeenCalledWith('Work')
    expect(historyHandlers.onToggleTag).toHaveBeenCalledWith('planning')
    expect(historyHandlers.onSetSelectionMode).toHaveBeenCalledWith(false)
    expect(historyHandlers.onBulkMoveToFolder).toHaveBeenCalled()
    expect(historyHandlers.onBulkAddTags).toHaveBeenCalled()
    expect(historyHandlers.onBulkRemoveTags).toHaveBeenCalled()
  })
})
