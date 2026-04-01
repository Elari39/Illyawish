import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import type {
  ChatSettings,
  ConversationSettings,
  KnowledgeSpace,
  ProviderState,
} from '../../../types/chat'
import { ChatContextBar } from './chat-context-bar'

const chatSettings: ChatSettings = {
  globalPrompt: '',
  providerPresetId: null,
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}

const settings: ConversationSettings = {
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

const knowledgeSpaces: KnowledgeSpace[] = []

describe('ChatContextBar', () => {
  it('renders only the model selector in compact mode', () => {
    render(
      <TestProviders>
        <ChatContextBar
          compact
          chatSettings={chatSettings}
          settings={settings}
          providerState={providerState}
          knowledgeSpaceIds={[]}
          knowledgeSpaces={knowledgeSpaces}
          onOpenKnowledgeSettings={vi.fn()}
          onProviderModelChange={vi.fn()}
          onSetAsDefault={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByLabelText('Provider and model')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Knowledge disabled' })).not.toBeInTheDocument()
  })
})
