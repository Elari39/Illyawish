import type { Dispatch, SetStateAction } from 'react'

import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
  KnowledgeDocument,
  KnowledgeSpace,
  ProviderPreset,
  ProviderState,
  RAGProviderState,
} from '../../../types/chat'
import type {
  ConfirmationState,
  PromptState,
  ProviderFormState,
  SettingsTab,
  ToastState,
} from '../types'

export interface ChatOverlaysProps {
  activeTab: SettingsTab
  confirmation: ConfirmationState | null
  editingProviderId: number | null
  chatSettings: ChatSettings
  conversationFolder: string
  conversationTags: string
  showArchived: boolean
  availableFolders: string[]
  availableTags: string[]
  selectedFolder: string | null
  selectedTags: string[]
  knowledgeSpaceIds: number[]
  pendingKnowledgeSpaceIds: number[]
  isLoadingProviders: boolean
  isOpen: boolean
  isImporting: boolean
  isSaving: boolean
  isSavingProvider: boolean
  isTestingProvider: boolean
  messageCount: number
  selectedConversationIds: Conversation['id'][]
  selectionMode: boolean
  promptState: PromptState | null
  providerForm: ProviderFormState
  providerState: ProviderState | null
  ragProviderState: RAGProviderState | null
  knowledgeSpaces: KnowledgeSpace[]
  knowledgeDocuments: Record<number, KnowledgeDocument[]>
  settings: ConversationSettings
  setChatSettings: Dispatch<SetStateAction<ChatSettings>>
  setConversationFolder: Dispatch<SetStateAction<string>>
  setConversationTags: Dispatch<SetStateAction<string>>
  onToggleArchived: (value: boolean) => void
  onSelectFolder: (value: string | null) => void
  onToggleTag: (value: string) => void
  onSetSelectionMode: (value: boolean) => void
  onBulkMoveToFolder: () => void
  onBulkAddTags: () => void
  onBulkRemoveTags: () => void
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
  transferConversation: Conversation | null
  toasts: ToastState[]
  onActivateProvider: (providerId: number) => void
  onCloseConfirmation: () => void
  onClosePrompt: () => void
  onCloseSettings: () => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onDismissToast: (toastId: number) => void
  onPauseToast: (toastId: number) => void
  onResumeToast: (toastId: number) => void
  onEditProvider: (preset: ProviderPreset) => void
  onExport: () => void
  onImport: (file: File) => void
  onProviderFieldChange: (
    field: 'name' | 'format' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) => void
  onProviderModelsChange: (value: {
    defaultModel: string
    models: string[]
  }) => void
  onProviderTabChange: (tab: SettingsTab) => void
  onCreateRAGProvider: (payload: {
    name: string
    baseURL: string
    apiKey: string
    embeddingModel: string
    rerankerModel: string
  }) => Promise<void>
  onActivateRAGProvider: (providerId: number) => Promise<void>
  onLoadKnowledgeDocuments: (spaceId: number) => Promise<void>
  onToggleKnowledgeSpace: (space: KnowledgeSpace) => void | Promise<void>
  onCreateKnowledgeSpace: (payload: {
    name: string
    description?: string
  }) => Promise<KnowledgeSpace | null>
  onUpdateKnowledgeSpace: (
    spaceId: number,
    payload: {
      name?: string
      description?: string
    },
  ) => Promise<KnowledgeSpace | null>
  onDeleteKnowledgeSpace: (spaceId: number) => Promise<boolean>
  onCreateKnowledgeDocument: (
    spaceId: number,
    payload: {
      title: string
      sourceType: string
      sourceUri?: string
      content: string
    },
  ) => Promise<KnowledgeDocument | null>
  onUpdateKnowledgeDocument: (
    spaceId: number,
    documentId: number,
    payload: {
      title?: string
      sourceUri?: string
      content?: string
    },
  ) => Promise<KnowledgeDocument | null>
  onDeleteKnowledgeDocument: (
    spaceId: number,
    documentId: number,
  ) => Promise<boolean>
  onUploadKnowledgeDocuments: (
    spaceId: number,
    files: File[],
  ) => Promise<KnowledgeDocument[] | null>
  onReplaceKnowledgeDocumentFile: (
    spaceId: number,
    documentId: number,
    file: File,
    title?: string,
  ) => Promise<KnowledgeDocument | null>
  onReset: () => void
  onResetProvider: () => void
  onSave: () => void
  onSaveProvider: () => void
  onStartNewProvider: () => void
  onTestProvider: () => void
}
