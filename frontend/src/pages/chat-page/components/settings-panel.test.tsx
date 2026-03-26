import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

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
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}

const initialSettings: ConversationSettings = {
  systemPrompt: '',
  model: '',
  temperature: 1,
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

function ProviderSettingsHarness() {
  const [chatSettings, setChatSettings] = useState(initialChatSettings)
  const [settings, setSettings] = useState(initialSettings)
  const [providerForm, setProviderForm] = useState({
    name: '',
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
      editingProviderId={null}
      isLoadingProviders={false}
      isImporting={false}
      isOpen
      messageCount={0}
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
      setSettings={setSettings}
      transferConversation={null}
    />
  )
}

describe('SettingsPanel', () => {
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

    const apiKeyInput = screen.getByRole('textbox', { name: /^API key/i })
    apiKeyInput.focus()
    fireEvent.change(apiKeyInput, {
      target: { value: 'sk-test' },
    })
    expect(apiKeyInput).toHaveFocus()
  })
})
