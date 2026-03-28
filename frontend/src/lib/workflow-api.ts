import type {
  CreateWorkflowPresetPayload,
  UpdateWorkflowPresetPayload,
  WorkflowPreset,
  WorkflowTemplate,
} from '../types/chat'
import { apiRequest } from './api-client'

export const workflowApi = {
  async listTemplates() {
    const response = await apiRequest<{ templates: Record<string, WorkflowTemplate> }>(
      '/api/workflows/templates',
    )
    return Object.values(response.templates)
  },
  async listPresets() {
    const response = await apiRequest<{ presets: WorkflowPreset[] }>('/api/workflows/presets')
    return response.presets
  },
  async createPreset(payload: CreateWorkflowPresetPayload) {
    const response = await apiRequest<{ preset: WorkflowPreset }>('/api/workflows/presets', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return response.preset
  },
  async updatePreset(presetId: number, payload: UpdateWorkflowPresetPayload) {
    const response = await apiRequest<{ preset: WorkflowPreset }>(`/api/workflows/presets/${presetId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return response.preset
  },
  async deletePreset(presetId: number) {
    await apiRequest<void>(`/api/workflows/presets/${presetId}`, {
      method: 'DELETE',
    })
  },
}
