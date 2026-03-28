import { apiRequest } from './api-client'

export const agentApi = {
  confirmToolCall(confirmationId: string, approved: boolean) {
    return apiRequest<{ ok: boolean }>(`/api/agent/tool-confirmations/${confirmationId}`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    })
  },
}
