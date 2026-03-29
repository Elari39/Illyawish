import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react'

import { Button } from '../../../components/ui/button'
import { LanguageSwitcher } from '../../../i18n/language-switcher'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
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
import { canReuseActivePresetAPIKey } from '../utils'
import { ChatSettingsTab } from './chat-settings-tab'
import { HistorySettingsTab } from './history-settings-tab'
import { KnowledgeSettingsTab } from './knowledge-settings-tab'
import { ProviderSettingsTab } from './provider-settings-tab'
import { RAGProviderSettingsTab } from './rag-provider-settings-tab'
import { SecuritySettingsTab } from './security-settings-tab'
import { TransferSettingsTab } from './transfer-settings-tab'
import { WorkflowSettingsTab } from './workflow-settings-tab'

interface SettingsPanelProps {
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
    field: 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
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

export function SettingsPanel({
  activeTab,
  editingProviderId,
  chatSettings,
  conversationFolder,
  conversationTags,
  showArchived,
  availableFolders,
  availableTags,
  selectedFolder,
  selectedTags,
  workflowPresetId = null,
  knowledgeSpaceIds = [],
  pendingKnowledgeSpaceIds = [],
  isLoadingProviders,
  isImporting,
  isOpen,
  messageCount,
  selectedConversationIds,
  selectionMode,
  isSavingProvider,
  isTestingProvider,
  isSaving,
  onActivateProvider,
  transferConversation,
  settings,
  providerForm,
  providerState,
  ragProviderState = null,
  knowledgeSpaces = [],
  knowledgeDocuments = {},
  workflowTemplates = [],
  workflowPresets = [],
  setChatSettings,
  setConversationFolder,
  setConversationTags,
  onToggleArchived,
  onSelectFolder,
  onToggleTag,
  onSetSelectionMode,
  onBulkMoveToFolder,
  onBulkAddTags,
  onBulkRemoveTags,
  setWorkflowPresetId = () => undefined,
  onToggleKnowledgeSpace = async () => undefined,
  setSettings,
  onClose,
  onDeleteProvider,
  onEditProvider,
  onExport,
  onImport,
  onProviderFieldChange,
  onProviderModelsChange,
  onProviderTabChange,
  onCreateRAGProvider = async () => undefined,
  onActivateRAGProvider = async () => undefined,
  onLoadKnowledgeDocuments = async () => undefined,
  onCreateKnowledgeSpace = async () => null,
  onUpdateKnowledgeSpace = async () => null,
  onDeleteKnowledgeSpace = async () => false,
  onCreateKnowledgeDocument = async () => null,
  onUpdateKnowledgeDocument = async () => null,
  onDeleteKnowledgeDocument = async () => false,
  onUploadKnowledgeDocuments = async () => null,
  onReplaceKnowledgeDocumentFile = async () => null,
  onCreateWorkflowPreset = async () => null,
  onUpdateWorkflowPreset = async () => null,
  onDeleteWorkflowPreset = async () => false,
  onReset,
  onResetProvider,
  onSave,
  onSaveProvider,
  onTestProvider,
  onStartNewProvider,
}: SettingsPanelProps) {
  const { t } = useI18n()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  const wasOpenRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      closeButtonRef.current?.focus()
    }

    wasOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const canReuseActiveAPIKey =
    editingProviderId == null && canReuseActivePresetAPIKey(providerState)
  const descriptionText =
    activeTab === 'chat'
      ? t('settings.chatDescription')
      : activeTab === 'history'
        ? t('settings.historyDescription')
        : activeTab === 'provider'
          ? t('settings.providerDescription')
          : activeTab === 'rag'
            ? t('settings.ragDescription')
            : activeTab === 'knowledge'
              ? t('settings.knowledgeDescription')
              : activeTab === 'workflow'
                ? t('settings.workflowDescription')
                : activeTab === 'security'
                  ? t('settings.securityDescription')
                  : activeTab === 'language'
                    ? t('settings.languageDescription')
                    : t('settings.transferDescription')

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--overlay-scrim)] px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-lg)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-['Lora',serif] text-2xl font-bold tracking-tight" id={titleId}>
              {t('settings.title')}
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]" id={descriptionId}>
              {descriptionText}
            </p>
          </div>
          <button
            aria-label={t('common.close')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)]"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 inline-flex flex-wrap rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] p-1">
          <TabButton
            active={activeTab === 'chat'}
            label={t('settings.chatTab')}
            onClick={() => onProviderTabChange('chat')}
          />
          <TabButton
            active={activeTab === 'history'}
            label={t('settings.historyTab')}
            onClick={() => onProviderTabChange('history')}
          />
          <TabButton
            active={activeTab === 'provider'}
            label={t('settings.providerTab')}
            onClick={() => onProviderTabChange('provider')}
          />
          <TabButton
            active={activeTab === 'rag'}
            label={t('settings.ragTab')}
            onClick={() => onProviderTabChange('rag')}
          />
          <TabButton
            active={activeTab === 'knowledge'}
            label={t('settings.knowledgeTab')}
            onClick={() => onProviderTabChange('knowledge')}
          />
          <TabButton
            active={activeTab === 'workflow'}
            label={t('settings.workflowTab')}
            onClick={() => onProviderTabChange('workflow')}
          />
          <TabButton
            active={activeTab === 'security'}
            label={t('settings.securityTab')}
            onClick={() => onProviderTabChange('security')}
          />
          <TabButton
            active={activeTab === 'language'}
            label={t('settings.languageTab')}
            onClick={() => onProviderTabChange('language')}
          />
          <TabButton
            active={activeTab === 'transfer'}
            label={t('settings.transferTab')}
            onClick={() => onProviderTabChange('transfer')}
          />
        </div>

        {activeTab === 'chat' ? (
          <ChatSettingsTab
            chatSettings={chatSettings}
            conversationFolder={conversationFolder}
            conversationTags={conversationTags}
            providerState={providerState}
            settings={settings}
            setConversationFolder={setConversationFolder}
            setConversationTags={setConversationTags}
            setChatSettings={setChatSettings}
            setSettings={setSettings}
          />
        ) : activeTab === 'history' ? (
          <HistorySettingsTab
            availableFolders={availableFolders}
            availableTags={availableTags}
            selectedConversationIds={selectedConversationIds}
            selectedFolder={selectedFolder}
            selectedTags={selectedTags}
            selectionMode={selectionMode}
            showArchived={showArchived}
            onBulkAddTags={onBulkAddTags}
            onBulkMoveToFolder={onBulkMoveToFolder}
            onBulkRemoveTags={onBulkRemoveTags}
            onSelectFolder={onSelectFolder}
            onSetSelectionMode={onSetSelectionMode}
            onToggleArchived={onToggleArchived}
            onToggleTag={onToggleTag}
          />
        ) : activeTab === 'rag' ? (
          <RAGProviderSettingsTab
            activateProvider={onActivateRAGProvider}
            createProvider={onCreateRAGProvider}
            providerState={ragProviderState}
          />
        ) : activeTab === 'knowledge' ? (
          <KnowledgeSettingsTab
            createKnowledgeDocument={onCreateKnowledgeDocument}
            createKnowledgeSpace={onCreateKnowledgeSpace}
            deleteKnowledgeDocument={onDeleteKnowledgeDocument}
            deleteKnowledgeSpace={onDeleteKnowledgeSpace}
            knowledgeDocuments={knowledgeDocuments}
            knowledgeSpaces={knowledgeSpaces}
            loadKnowledgeDocuments={onLoadKnowledgeDocuments}
            onToggleKnowledgeSpace={onToggleKnowledgeSpace}
            pendingKnowledgeSpaceIds={pendingKnowledgeSpaceIds}
            replaceKnowledgeDocumentFile={onReplaceKnowledgeDocumentFile}
            selectedKnowledgeSpaceIds={knowledgeSpaceIds}
            uploadKnowledgeDocuments={onUploadKnowledgeDocuments}
            updateKnowledgeDocument={onUpdateKnowledgeDocument}
            updateKnowledgeSpace={onUpdateKnowledgeSpace}
          />
        ) : activeTab === 'workflow' ? (
          <WorkflowSettingsTab
            createWorkflowPreset={onCreateWorkflowPreset}
            deleteWorkflowPreset={onDeleteWorkflowPreset}
            selectedWorkflowPresetId={workflowPresetId}
            setSelectedWorkflowPresetId={setWorkflowPresetId}
            updateWorkflowPreset={onUpdateWorkflowPreset}
            workflowPresets={workflowPresets}
            workflowTemplates={workflowTemplates}
          />
        ) : activeTab === 'provider' ? (
          <ProviderSettingsTab
            canReuseActiveAPIKey={canReuseActiveAPIKey}
            editingProviderId={editingProviderId}
            isLoadingProviders={isLoadingProviders}
            isSavingProvider={isSavingProvider}
            onActivateProvider={onActivateProvider}
            onDeleteProvider={onDeleteProvider}
            onEditProvider={onEditProvider}
            onProviderFieldChange={onProviderFieldChange}
            onProviderModelsChange={onProviderModelsChange}
            onResetProvider={onResetProvider}
            onStartNewProvider={onStartNewProvider}
            providerForm={providerForm}
            providerState={providerState}
          />
        ) : activeTab === 'security' ? (
          <SecuritySettingsTab />
        ) : activeTab === 'language' ? (
          <div className="mt-6">
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
              <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                {t('settings.languageHelp')}
              </p>
              <LanguageSwitcher className="mt-4" />
            </div>
          </div>
        ) : (
          <TransferSettingsTab
            conversation={transferConversation}
            isImporting={isImporting}
            messageCount={messageCount}
            onExport={onExport}
            onImport={onImport}
          />
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {activeTab === 'chat' ? (
            <>
              <Button onClick={onReset} variant="ghost">
                {t('common.reset')}
              </Button>
              <Button onClick={onClose} variant="secondary">
                {t('common.close')}
              </Button>
              <Button disabled={isSaving} onClick={onSave}>
                {isSaving ? t('common.saving') : t('settings.saveSettings')}
              </Button>
            </>
          ) : activeTab === 'provider' ? (
            <>
              <Button onClick={onResetProvider} variant="ghost">
                {editingProviderId
                  ? t('settings.newPreset')
                  : t('settings.resetForm')}
              </Button>
              <Button
                disabled={isLoadingProviders || isSavingProvider || isTestingProvider}
                onClick={onTestProvider}
                variant="secondary"
              >
                {isTestingProvider
                  ? t('settings.testingConnection')
                  : t('settings.testConnection')}
              </Button>
              <Button onClick={onClose} variant="secondary">
                {t('common.close')}
              </Button>
              <Button
                disabled={isLoadingProviders || isSavingProvider}
                onClick={onSaveProvider}
              >
                {isSavingProvider
                  ? t('common.saving')
                  : editingProviderId
                    ? t('settings.savePreset')
                    : t('settings.createPreset')}
              </Button>
            </>
          ) : (
            <Button onClick={onClose} variant="secondary">
              {t('common.close')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'rounded-xl px-4 py-2 text-sm font-medium transition',
        active
          ? 'bg-[var(--surface-strong)] text-[var(--foreground)] shadow-sm'
          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}
