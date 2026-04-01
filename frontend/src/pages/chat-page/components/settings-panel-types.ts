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
  WorkflowPreset,
  WorkflowTemplate,
} from '../../../types/chat'
import type { ProviderFormState, SettingsTab } from '../types'

export interface SettingsPanelProps {
  activeTab: SettingsTab
  editingProviderId: number | null
  chatSettings: ChatSettings
  conversationFolder: string
  conversationTags: string
  showArchived: boolean
  availableFolders: string[]
  availableTags: string[]
  selectedFolder: string | null
  selectedTags: string[]
  workflowPresetId?: number | null
  knowledgeSpaceIds?: number[]
  pendingKnowledgeSpaceIds?: number[]
  isLoadingProviders: boolean
  isImporting: boolean
  isOpen: boolean
  messageCount: number
  selectedConversationIds: Conversation['id'][]
  selectionMode: boolean
  isSavingProvider: boolean
  isTestingProvider: boolean
  isSaving: boolean
  onActivateProvider: (providerId: number) => void
  transferConversation: Conversation | null
  settings: ConversationSettings
  providerForm: ProviderFormState
  providerState: ProviderState | null
  ragProviderState?: RAGProviderState | null
  knowledgeSpaces?: KnowledgeSpace[]
  knowledgeDocuments?: Record<number, KnowledgeDocument[]>
  workflowTemplates?: WorkflowTemplate[]
  workflowPresets?: WorkflowPreset[]
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
  setWorkflowPresetId?: Dispatch<SetStateAction<number | null>>
  onToggleKnowledgeSpace?: (space: KnowledgeSpace) => void | Promise<void>
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
  onClose: () => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onEditProvider: (preset: ProviderPreset) => void
  onExport: () => void
  onImport: (file: File) => void
  onProviderFieldChange: (
    field: 'name' | 'format' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) => void
  onProviderModelsChange: (
    value: {
      defaultModel: string
      models: string[]
    },
  ) => void
  onProviderTabChange: (tab: SettingsTab) => void
  onCreateRAGProvider?: (payload: {
    name: string
    baseURL: string
    apiKey: string
    embeddingModel: string
    rerankerModel: string
  }) => Promise<void>
  onActivateRAGProvider?: (providerId: number) => Promise<void>
  onLoadKnowledgeDocuments?: (spaceId: number) => Promise<void>
  onCreateKnowledgeSpace?: (payload: {
    name: string
    description?: string
  }) => Promise<KnowledgeSpace | null>
  onUpdateKnowledgeSpace?: (spaceId: number, payload: {
    name?: string
    description?: string
  }) => Promise<KnowledgeSpace | null>
  onDeleteKnowledgeSpace?: (spaceId: number) => Promise<boolean>
  onCreateKnowledgeDocument?: (
    spaceId: number,
    payload: {
      title: string
      sourceType: string
      sourceUri?: string
      content: string
    },
  ) => Promise<KnowledgeDocument | null>
  onUpdateKnowledgeDocument?: (
    spaceId: number,
    documentId: number,
    payload: {
      title?: string
      sourceUri?: string
      content?: string
    },
  ) => Promise<KnowledgeDocument | null>
  onDeleteKnowledgeDocument?: (
    spaceId: number,
    documentId: number,
  ) => Promise<boolean>
  onUploadKnowledgeDocuments?: (
    spaceId: number,
    files: File[],
  ) => Promise<KnowledgeDocument[] | null>
  onReplaceKnowledgeDocumentFile?: (
    spaceId: number,
    documentId: number,
    file: File,
    title?: string,
  ) => Promise<KnowledgeDocument | null>
  onCreateWorkflowPreset?: (payload: {
    name: string
    templateKey: string
    defaultInputs?: Record<string, unknown>
    knowledgeSpaceIds?: number[]
    toolEnablements?: Record<string, boolean>
    outputMode?: string
  }) => Promise<WorkflowPreset | null>
  onUpdateWorkflowPreset?: (presetId: number, payload: {
    name?: string
    templateKey?: string
    defaultInputs?: Record<string, unknown>
    knowledgeSpaceIds?: number[]
    toolEnablements?: Record<string, boolean>
    outputMode?: string
  }) => Promise<WorkflowPreset | null>
  onDeleteWorkflowPreset?: (presetId: number) => Promise<boolean>
  onReset: () => void
  onResetProvider: () => void
  onSave: () => void
  onSaveProvider: () => void
  onTestProvider: () => void
  onStartNewProvider: () => void
}
