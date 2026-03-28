import type {
  CreateKnowledgeDocumentPayload,
  CreateKnowledgeSpacePayload,
  CreateRAGProviderPayload,
  KnowledgeDocument,
  KnowledgeSpace,
  RAGProviderState,
  UpdateKnowledgeDocumentPayload,
  UpdateKnowledgeSpacePayload,
} from '../types/chat'
import { apiRequest } from './api-client'

export const ragApi = {
  getProviders() {
    return apiRequest<RAGProviderState>('/api/rag/providers')
  },
  createProvider(payload: CreateRAGProviderPayload) {
    return apiRequest<RAGProviderState>('/api/rag/providers', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateProvider(providerId: number, payload: CreateRAGProviderPayload) {
    return apiRequest<RAGProviderState>(`/api/rag/providers/${providerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  activateProvider(providerId: number) {
    return apiRequest<RAGProviderState>(`/api/rag/providers/${providerId}/activate`, {
      method: 'POST',
    })
  },
  deleteProvider(providerId: number) {
    return apiRequest<RAGProviderState>(`/api/rag/providers/${providerId}`, {
      method: 'DELETE',
    })
  },
  async listKnowledgeSpaces() {
    const response = await apiRequest<{ spaces: KnowledgeSpace[] }>('/api/knowledge/spaces')
    return response.spaces
  },
  async createKnowledgeSpace(payload: CreateKnowledgeSpacePayload) {
    const response = await apiRequest<{ space: KnowledgeSpace }>('/api/knowledge/spaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return response.space
  },
  async updateKnowledgeSpace(spaceId: number, payload: UpdateKnowledgeSpacePayload) {
    const response = await apiRequest<{ space: KnowledgeSpace }>(`/api/knowledge/spaces/${spaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return response.space
  },
  async deleteKnowledgeSpace(spaceId: number) {
    await apiRequest<void>(`/api/knowledge/spaces/${spaceId}`, {
      method: 'DELETE',
    })
  },
  async listKnowledgeDocuments(spaceId: number) {
    const response = await apiRequest<{ documents: KnowledgeDocument[] }>(
      `/api/knowledge/spaces/${spaceId}/documents`,
    )
    return response.documents
  },
  async createKnowledgeDocument(spaceId: number, payload: CreateKnowledgeDocumentPayload) {
    const response = await apiRequest<{ document: KnowledgeDocument }>(
      `/api/knowledge/spaces/${spaceId}/documents`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
    return response.document
  },
  async updateKnowledgeDocument(
    spaceId: number,
    documentId: number,
    payload: UpdateKnowledgeDocumentPayload,
  ) {
    const response = await apiRequest<{ document: KnowledgeDocument }>(
      `/api/knowledge/spaces/${spaceId}/documents/${documentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    )
    return response.document
  },
  async deleteKnowledgeDocument(spaceId: number, documentId: number) {
    await apiRequest<void>(`/api/knowledge/spaces/${spaceId}/documents/${documentId}`, {
      method: 'DELETE',
    })
  },
  async uploadKnowledgeDocuments(spaceId: number, files: File[]) {
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    const response = await apiRequest<{ documents: KnowledgeDocument[] }>(
      `/api/knowledge/spaces/${spaceId}/documents/upload`,
      {
        method: 'POST',
        body: formData,
      },
    )
    return response.documents
  },
  async replaceKnowledgeDocumentFile(
    spaceId: number,
    documentId: number,
    file: File,
    title?: string,
  ) {
    const formData = new FormData()
    formData.append('file', file)
    if (title && title.trim() !== '') {
      formData.append('title', title)
    }

    const response = await apiRequest<{ document: KnowledgeDocument }>(
      `/api/knowledge/spaces/${spaceId}/documents/${documentId}/replace`,
      {
        method: 'POST',
        body: formData,
      },
    )
    return response.document
  },
}
