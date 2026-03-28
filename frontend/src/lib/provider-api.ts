import type {
  CreateProviderPayload,
  ProviderState,
  TestProviderPayload,
  TestProviderResult,
  UpdateProviderPayload,
} from '../types/chat'
import { apiRequest } from './api-client'

export const providerApi = {
  list() {
    return apiRequest<ProviderState>('/api/ai/providers')
  },
  create(payload: CreateProviderPayload) {
    return apiRequest<ProviderState>('/api/ai/providers', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(providerId: number, payload: UpdateProviderPayload) {
    return apiRequest<ProviderState>(`/api/ai/providers/${providerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  activate(providerId: number) {
    return apiRequest<ProviderState>(`/api/ai/providers/${providerId}/activate`, {
      method: 'POST',
    })
  },
  delete(providerId: number) {
    return apiRequest<ProviderState>(`/api/ai/providers/${providerId}`, {
      method: 'DELETE',
    })
  },
  test(payload: TestProviderPayload) {
    return apiRequest<TestProviderResult>('/api/ai/providers/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
