import { Suspense, lazy } from 'react'
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
import type {
  ConfirmationState,
  PromptState,
  ProviderFormState,
  SettingsTab,
  ToastState,
} from '../types'

const SettingsPanel = lazy(async () => import('./settings-panel').then((module) => ({
  default: module.SettingsPanel,
})))
const ConfirmationDialog = lazy(async () => import('./confirmation-dialog').then((module) => ({
  default: module.ConfirmationDialog,
})))
const PromptDialog = lazy(async () => import('./prompt-dialog').then((module) => ({
  default: module.PromptDialog,
})))
const ToastViewport = lazy(async () => import('./toast-viewport').then((module) => ({
  default: module.ToastViewport,
})))

interface ChatOverlaysProps {
  activeTab: SettingsTab
  confirmation: ConfirmationState | null
  editingProviderId: number | null
  chatSettings: ChatSettings
  conversationFolder: string
  conversationTags: string
  workflowPresetId: number | null
  knowledgeSpaceIds: number[]
  pendingKnowledgeSpaceIds: number[]
  isLoadingProviders: boolean
  isOpen: boolean
  isImporting: boolean
  isSaving: boolean
  isSavingProvider: boolean
  isTestingProvider: boolean
  messageCount: number
  promptState: PromptState | null
  providerForm: ProviderFormState
  providerState: ProviderState | null
  ragProviderState: RAGProviderState | null
  knowledgeSpaces: KnowledgeSpace[]
  knowledgeDocuments: Record<number, KnowledgeDocument[]>
  workflowTemplates: WorkflowTemplate[]
  workflowPresets: WorkflowPreset[]
  settings: ConversationSettings
  setChatSettings: Dispatch<SetStateAction<ChatSettings>>
  setConversationFolder: Dispatch<SetStateAction<string>>
  setConversationTags: Dispatch<SetStateAction<string>>
  setWorkflowPresetId: Dispatch<SetStateAction<number | null>>
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
  transferConversation: Conversation | null
  toasts: ToastState[]
  onActivateProvider: (providerId: number) => void
  onCloseConfirmation: () => void
  onClosePrompt: () => void
  onCloseSettings: () => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onDismissToast: (toastId: number) => void
  onEditProvider: (preset: ProviderPreset) => void
  onExport: () => void
  onImport: (file: File) => void
  onProviderFieldChange: (
    field: 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) => void
  onProviderModelsChange: (value: { defaultModel: string; models: string[] }) => void
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
  onUpdateKnowledgeSpace: (spaceId: number, payload: {
    name?: string
    description?: string
  }) => Promise<KnowledgeSpace | null>
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
  onDeleteKnowledgeDocument: (spaceId: number, documentId: number) => Promise<boolean>
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
  onCreateWorkflowPreset: (payload: {
    name: string
    templateKey: string
    defaultInputs?: Record<string, unknown>
    knowledgeSpaceIds?: number[]
    toolEnablements?: Record<string, boolean>
    outputMode?: string
  }) => Promise<WorkflowPreset | null>
  onUpdateWorkflowPreset: (presetId: number, payload: {
    name?: string
    templateKey?: string
    defaultInputs?: Record<string, unknown>
    knowledgeSpaceIds?: number[]
    toolEnablements?: Record<string, boolean>
    outputMode?: string
  }) => Promise<WorkflowPreset | null>
  onDeleteWorkflowPreset: (presetId: number) => Promise<boolean>
  onReset: () => void
  onResetProvider: () => void
  onSave: () => void
  onSaveProvider: () => void
  onStartNewProvider: () => void
  onTestProvider: () => void
}

export function ChatOverlays({
  activeTab,
  confirmation,
  editingProviderId,
  chatSettings,
  conversationFolder,
  conversationTags,
  workflowPresetId,
  knowledgeSpaceIds,
  pendingKnowledgeSpaceIds,
  isLoadingProviders,
  isOpen,
  isImporting,
  isSaving,
  isSavingProvider,
  isTestingProvider,
  messageCount,
  promptState,
  providerForm,
  providerState,
  ragProviderState,
  knowledgeSpaces,
  knowledgeDocuments,
  workflowTemplates,
  workflowPresets,
  settings,
  setChatSettings,
  setConversationFolder,
  setConversationTags,
  setWorkflowPresetId,
  setSettings,
  transferConversation,
  toasts,
  onActivateProvider,
  onCloseConfirmation,
  onClosePrompt,
  onCloseSettings,
  onDeleteProvider,
  onDismissToast,
  onEditProvider,
  onExport,
  onImport,
  onProviderFieldChange,
  onProviderModelsChange,
  onProviderTabChange,
  onCreateRAGProvider,
  onActivateRAGProvider,
  onLoadKnowledgeDocuments,
  onToggleKnowledgeSpace,
  onCreateKnowledgeSpace,
  onUpdateKnowledgeSpace,
  onDeleteKnowledgeSpace,
  onCreateKnowledgeDocument,
  onUpdateKnowledgeDocument,
  onDeleteKnowledgeDocument,
  onUploadKnowledgeDocuments,
  onReplaceKnowledgeDocumentFile,
  onCreateWorkflowPreset,
  onUpdateWorkflowPreset,
  onDeleteWorkflowPreset,
  onReset,
  onResetProvider,
  onSave,
  onSaveProvider,
  onStartNewProvider,
  onTestProvider,
}: ChatOverlaysProps) {
  return (
    <Suspense fallback={null}>
      <SettingsPanel
        activeTab={activeTab}
        chatSettings={chatSettings}
        conversationFolder={conversationFolder}
        conversationTags={conversationTags}
        workflowPresetId={workflowPresetId}
        knowledgeSpaceIds={knowledgeSpaceIds}
        pendingKnowledgeSpaceIds={pendingKnowledgeSpaceIds}
        editingProviderId={editingProviderId}
        isLoadingProviders={isLoadingProviders}
        isOpen={isOpen}
        isImporting={isImporting}
        isSavingProvider={isSavingProvider}
        isTestingProvider={isTestingProvider}
        isSaving={isSaving}
        messageCount={messageCount}
        onActivateProvider={(providerId) => void onActivateProvider(providerId)}
        onClose={onCloseSettings}
        onDeleteProvider={onDeleteProvider}
        onEditProvider={onEditProvider}
        onExport={onExport}
        onImport={onImport}
        onProviderFieldChange={onProviderFieldChange}
        onProviderModelsChange={onProviderModelsChange}
        onProviderTabChange={onProviderTabChange}
        onReset={onReset}
        onResetProvider={onResetProvider}
        onSave={() => void onSave()}
        onSaveProvider={() => void onSaveProvider()}
        onStartNewProvider={onStartNewProvider}
        onTestProvider={() => void onTestProvider()}
        providerForm={providerForm}
        providerState={providerState}
        ragProviderState={ragProviderState}
        knowledgeSpaces={knowledgeSpaces}
        knowledgeDocuments={knowledgeDocuments}
        workflowTemplates={workflowTemplates}
        workflowPresets={workflowPresets}
        settings={settings}
        setChatSettings={setChatSettings}
        setConversationFolder={setConversationFolder}
        setConversationTags={setConversationTags}
        setWorkflowPresetId={setWorkflowPresetId}
        onToggleKnowledgeSpace={onToggleKnowledgeSpace}
        setSettings={setSettings}
        transferConversation={transferConversation}
        onCreateRAGProvider={onCreateRAGProvider}
        onActivateRAGProvider={onActivateRAGProvider}
        onLoadKnowledgeDocuments={onLoadKnowledgeDocuments}
        onCreateKnowledgeSpace={onCreateKnowledgeSpace}
        onUpdateKnowledgeSpace={onUpdateKnowledgeSpace}
        onDeleteKnowledgeSpace={onDeleteKnowledgeSpace}
        onCreateKnowledgeDocument={onCreateKnowledgeDocument}
        onUpdateKnowledgeDocument={onUpdateKnowledgeDocument}
        onDeleteKnowledgeDocument={onDeleteKnowledgeDocument}
        onUploadKnowledgeDocuments={onUploadKnowledgeDocuments}
        onReplaceKnowledgeDocumentFile={onReplaceKnowledgeDocumentFile}
        onCreateWorkflowPreset={onCreateWorkflowPreset}
        onUpdateWorkflowPreset={onUpdateWorkflowPreset}
        onDeleteWorkflowPreset={onDeleteWorkflowPreset}
      />
      <ConfirmationDialog
        confirmation={confirmation}
        onClose={onCloseConfirmation}
      />
      <PromptDialog
        promptState={promptState}
        onClose={onClosePrompt}
      />
      <ToastViewport
        toasts={toasts}
        onDismiss={onDismissToast}
      />
    </Suspense>
  )
}
