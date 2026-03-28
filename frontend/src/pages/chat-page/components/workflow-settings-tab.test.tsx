import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { WorkflowPreset, WorkflowTemplate } from '../../../types/chat'
import { TestProviders } from '../../../test/test-providers'
import { WorkflowSettingsTab } from './workflow-settings-tab'

const templates: WorkflowTemplate[] = [
  {
    key: 'knowledge_qa',
    name: 'Knowledge Q&A',
    description: 'Answer questions from knowledge spaces.',
    nodes: [],
  },
  {
    key: 'webpage_digest',
    name: 'Webpage Digest',
    description: 'Fetch and summarize a webpage.',
    nodes: [],
  },
]

const initialPresets: WorkflowPreset[] = [
  {
    id: 1,
    userId: 9,
    name: 'Knowledge Q&A',
    templateKey: 'knowledge_qa',
    defaultInputs: {},
    knowledgeSpaceIds: [],
    toolEnablements: {},
    outputMode: 'markdown',
    createdAt: '2026-03-28T12:00:00Z',
    updatedAt: '2026-03-28T12:00:00Z',
  },
]

function WorkflowSettingsHarness() {
  const [selectedWorkflowPresetId, setSelectedWorkflowPresetId] = useState<number | null>(1)
  const [workflowPresets, setWorkflowPresets] = useState<WorkflowPreset[]>(initialPresets)

  return (
    <WorkflowSettingsTab
      createWorkflowPreset={async (payload) => {
        const created: WorkflowPreset = {
          id: 2,
          userId: 9,
          name: payload.name,
          templateKey: payload.templateKey,
          defaultInputs: payload.defaultInputs ?? {},
          knowledgeSpaceIds: payload.knowledgeSpaceIds ?? [],
          toolEnablements: payload.toolEnablements ?? {},
          outputMode: payload.outputMode ?? 'markdown',
          createdAt: '2026-03-28T13:00:00Z',
          updatedAt: '2026-03-28T13:00:00Z',
        }
        setWorkflowPresets((previous) => [created, ...previous])
        return created
      }}
      deleteWorkflowPreset={async (presetId) => {
        setWorkflowPresets((previous) => previous.filter((preset) => preset.id !== presetId))
        setSelectedWorkflowPresetId((previous) => (previous === presetId ? null : previous))
        return true
      }}
      selectedWorkflowPresetId={selectedWorkflowPresetId}
      setSelectedWorkflowPresetId={setSelectedWorkflowPresetId}
      updateWorkflowPreset={async (presetId, payload) => {
        const nextPreset = {
          ...(workflowPresets.find((preset) => preset.id === presetId) as WorkflowPreset),
          ...payload,
          updatedAt: '2026-03-28T14:00:00Z',
        }
        setWorkflowPresets((previous) =>
          previous.map((preset) => (preset.id === presetId ? nextPreset : preset)),
        )
        return nextPreset
      }}
      workflowPresets={workflowPresets}
      workflowTemplates={templates}
    />
  )
}

describe('WorkflowSettingsTab', () => {
  it('creates, updates, and deletes presets while keeping selection in sync', async () => {
    render(
      <TestProviders>
        <WorkflowSettingsHarness />
      </TestProviders>,
    )

    expect(screen.getByRole('option', { name: 'Knowledge Q&A · knowledge_qa' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Preset name' }), {
      target: { value: 'Web Digest' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Workflow template' }), {
      target: { value: 'webpage_digest' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create preset' }))

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Web Digest · webpage_digest' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit preset Web Digest' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Preset name' }), {
      target: { value: 'Web Digest Updated' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }))

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Web Digest Updated · webpage_digest' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Web Digest Updated' }))

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Web Digest Updated · webpage_digest' })).not.toBeInTheDocument()
    })

    expect(screen.getByRole('combobox', { name: 'Workflow preset' })).toHaveValue('')
  })

  it('shows a validation message when creating a preset without a name', async () => {
    const createWorkflowPreset = vi.fn()

    render(
      <TestProviders>
        <WorkflowSettingsTab
          createWorkflowPreset={createWorkflowPreset}
          deleteWorkflowPreset={async () => true}
          selectedWorkflowPresetId={null}
          setSelectedWorkflowPresetId={() => undefined}
          updateWorkflowPreset={async () => null}
          workflowPresets={[]}
          workflowTemplates={templates}
        />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create preset' }))

    expect(createWorkflowPreset).not.toHaveBeenCalled()
    expect(await screen.findByText('Enter a preset name')).toBeInTheDocument()
  })
})
