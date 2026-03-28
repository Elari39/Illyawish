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
import { canReuseActivePresetAPIKey, resolveChatModelOptions } from '../utils'
import { ChatSettingsTab } from './chat-settings-tab'
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
  workflowPresetId?: number | null
  knowledgeSpaceIds?: number[]
  isLoadingProviders: boolean
  isImporting: boolean
  isOpen: boolean
  messageCount: number
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
  setWorkflowPresetId?: Dispatch<SetStateAction<number | null>>
  setKnowledgeSpaceIds?: Dispatch<SetStateAction<number[]>>
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
  workflowPresetId = null,
  knowledgeSpaceIds = [],
  isLoadingProviders,
  isImporting,
  isOpen,
  messageCount,
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
  setWorkflowPresetId = () => undefined,
  setKnowledgeSpaceIds = () => undefined,
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

  const modelOptions = resolveChatModelOptions(providerState, chatSettings.model)
  const canReuseActiveAPIKey =
    editingProviderId == null && canReuseActivePresetAPIKey(providerState)
  const descriptionText =
    activeTab === 'chat'
      ? t('settings.chatDescription')
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
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
        className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-lg)]"
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-black/5"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 inline-flex rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] p-1">
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'chat'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('chat')}
            type="button"
          >
            {t('settings.chatTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'provider'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('provider')}
            type="button"
          >
            {t('settings.providerTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'rag'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('rag')}
            type="button"
          >
            {t('settings.ragTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'knowledge'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('knowledge')}
            type="button"
          >
            {t('settings.knowledgeTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'workflow'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('workflow')}
            type="button"
          >
            {t('settings.workflowTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'security'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('security')}
            type="button"
          >
            {t('settings.securityTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'language'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('language')}
            type="button"
          >
            {t('settings.languageTab')}
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              activeTab === 'transfer'
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
            onClick={() => onProviderTabChange('transfer')}
            type="button"
          >
            {t('settings.transferTab')}
          </button>
        </div>

        {activeTab === 'chat' ? (
          <ChatSettingsTab
            chatSettings={chatSettings}
            conversationFolder={conversationFolder}
            conversationTags={conversationTags}
            modelOptions={modelOptions}
            settings={settings}
            setConversationFolder={setConversationFolder}
            setConversationTags={setConversationTags}
            setChatSettings={setChatSettings}
            setSettings={setSettings}
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
            replaceKnowledgeDocumentFile={onReplaceKnowledgeDocumentFile}
            selectedKnowledgeSpaceIds={knowledgeSpaceIds}
            setSelectedKnowledgeSpaceIds={setKnowledgeSpaceIds}
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
