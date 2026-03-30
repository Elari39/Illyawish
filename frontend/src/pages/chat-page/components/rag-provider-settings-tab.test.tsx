import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import { RAGProviderSettingsTab } from './rag-provider-settings-tab'

describe('RAGProviderSettingsTab', () => {
  it('renders an empty api key input by default', () => {
    render(
      <TestProviders>
        <RAGProviderSettingsTab
          activateProvider={vi.fn(async () => undefined)}
          createProvider={vi.fn(async () => undefined)}
          providerState={null}
        />
      </TestProviders>,
    )

    expect(screen.getByLabelText(/^API key$/i)).toHaveValue('')
  })
})
