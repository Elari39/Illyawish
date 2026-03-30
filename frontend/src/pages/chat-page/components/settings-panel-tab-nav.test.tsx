import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import { SettingsPanelTabNav } from './settings-panel-tab-nav'

describe('SettingsPanelTabNav', () => {
  it('uses a horizontally scrollable tab strip for smaller screens', () => {
    render(
      <TestProviders>
        <SettingsPanelTabNav activeTab="provider" onTabChange={vi.fn()} />
      </TestProviders>,
    )

    const providerTab = screen.getByRole('button', { name: 'AI Provider' })
    const nav = providerTab.parentElement

    expect(nav?.className).toContain('overflow-x-auto')
    expect(nav?.className).toContain('whitespace-nowrap')
    expect(providerTab.className).toContain('shrink-0')
    expect(providerTab.className).toContain('whitespace-nowrap')
  })
})
