import type { Attachment } from '../types/chat'
import { apiRequest } from './api-client'

export const attachmentApi = {
  async upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiRequest<{ attachment: Attachment }>('/api/attachments', {
      method: 'POST',
      body: formData,
    })
    return response.attachment
  },
}
