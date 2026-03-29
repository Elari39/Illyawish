import { LanguageSwitcher } from '../../../i18n/language-switcher'
import { useI18n } from '../../../i18n/use-i18n'
import { canReuseActivePresetAPIKey } from '../provider-form-utils'
import { ChatSettingsTab } from './chat-settings-tab'
import { HistorySettingsTab } from './history-settings-tab'
import { KnowledgeSettingsTab } from './knowledge-settings-tab'
import { ProviderSettingsTab } from './provider-settings-tab'
import { RAGProviderSettingsTab } from './rag-provider-settings-tab'
import { SecuritySettingsTab } from './security-settings-tab'
import { TransferSettingsTab } from './transfer-settings-tab'
import { WorkflowSettingsTab } from './workflow-settings-tab'
import type { SettingsPanelProps } from './settings-panel-types'

type SettingsPanelBodyProps = Pick<
  SettingsPanelProps,
  | 'activeTab'
  | 'availableFolders'
  | 'availableTags'
  | 'chatSettings'
  | 'conversationFolder'
  | 'conversationTags'
  | 'editingProviderId'
  | 'isImporting'
  | 'isLoadingProviders'
  | 'isSavingProvider'
  | 'knowledgeDocuments'
  | 'knowledgeSpaceIds'
  | 'knowledgeSpaces'
  | 'messageCount'
  | 'onActivateProvider'
  | 'onActivateRAGProvider'
  | 'onBulkAddTags'
  | 'onBulkMoveToFolder'
  | 'onBulkRemoveTags'
  | 'onCreateKnowledgeDocument'
  | 'onCreateKnowledgeSpace'
  | 'onCreateRAGProvider'
  | 'onCreateWorkflowPreset'
  | 'onDeleteKnowledgeDocument'
  | 'onDeleteKnowledgeSpace'
  | 'onDeleteProvider'
  | 'onDeleteWorkflowPreset'
  | 'onEditProvider'
  | 'onExport'
  | 'onImport'
  | 'onLoadKnowledgeDocuments'
  | 'onProviderFieldChange'
  | 'onProviderModelsChange'
  | 'onResetProvider'
  | 'onSelectFolder'
  | 'onSetSelectionMode'
  | 'onStartNewProvider'
  | 'onToggleArchived'
  | 'onToggleKnowledgeSpace'
  | 'onToggleTag'
  | 'onUpdateKnowledgeDocument'
  | 'onUpdateKnowledgeSpace'
  | 'onUpdateWorkflowPreset'
  | 'onUploadKnowledgeDocuments'
  | 'onReplaceKnowledgeDocumentFile'
  | 'pendingKnowledgeSpaceIds'
  | 'providerForm'
  | 'providerState'
  | 'ragProviderState'
  | 'selectedConversationIds'
  | 'selectedFolder'
  | 'selectedTags'
  | 'selectionMode'
  | 'setChatSettings'
  | 'setConversationFolder'
  | 'setConversationTags'
  | 'setSettings'
  | 'setWorkflowPresetId'
  | 'settings'
  | 'showArchived'
  | 'transferConversation'
  | 'workflowPresetId'
  | 'workflowPresets'
  | 'workflowTemplates'
>

export function SettingsPanelBody({
  activeTab,
  availableFolders,
  availableTags,
  chatSettings,
  conversationFolder,
  conversationTags,
  editingProviderId,
  isImporting,
  isLoadingProviders,
  isSavingProvider,
  knowledgeDocuments = {},
  knowledgeSpaceIds = [],
  knowledgeSpaces = [],
  messageCount,
  onActivateProvider,
  onActivateRAGProvider = async () => undefined,
  onBulkAddTags,
  onBulkMoveToFolder,
  onBulkRemoveTags,
  onCreateKnowledgeDocument = async () => null,
  onCreateKnowledgeSpace = async () => null,
  onCreateRAGProvider = async () => undefined,
  onCreateWorkflowPreset = async () => null,
  onDeleteKnowledgeDocument = async () => false,
  onDeleteKnowledgeSpace = async () => false,
  onDeleteProvider,
  onDeleteWorkflowPreset = async () => false,
  onEditProvider,
  onExport,
  onImport,
  onLoadKnowledgeDocuments = async () => undefined,
  onProviderFieldChange,
  onProviderModelsChange,
  onResetProvider,
  onSelectFolder,
  onSetSelectionMode,
  onStartNewProvider,
  onToggleArchived,
  onToggleKnowledgeSpace = async () => undefined,
  onToggleTag,
  onUpdateKnowledgeDocument = async () => null,
  onUpdateKnowledgeSpace = async () => null,
  onUpdateWorkflowPreset = async () => null,
  onUploadKnowledgeDocuments = async () => null,
  onReplaceKnowledgeDocumentFile = async () => null,
  pendingKnowledgeSpaceIds = [],
  providerForm,
  providerState,
  ragProviderState = null,
  selectedConversationIds,
  selectedFolder,
  selectedTags,
  selectionMode,
  setChatSettings,
  setConversationFolder,
  setConversationTags,
  setSettings,
  setWorkflowPresetId = () => undefined,
  settings,
  showArchived,
  transferConversation,
  workflowPresetId = null,
  workflowPresets = [],
  workflowTemplates = [],
}: SettingsPanelBodyProps) {
  const { t } = useI18n()
  const canReuseActiveAPIKey =
    editingProviderId == null && canReuseActivePresetAPIKey(providerState)

  if (activeTab === 'chat') {
    return (
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
    )
  }

  if (activeTab === 'history') {
    return (
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
    )
  }

  if (activeTab === 'rag') {
    return (
      <RAGProviderSettingsTab
        activateProvider={onActivateRAGProvider}
        createProvider={onCreateRAGProvider}
        providerState={ragProviderState}
      />
    )
  }

  if (activeTab === 'knowledge') {
    return (
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
    )
  }

  if (activeTab === 'workflow') {
    return (
      <WorkflowSettingsTab
        createWorkflowPreset={onCreateWorkflowPreset}
        deleteWorkflowPreset={onDeleteWorkflowPreset}
        selectedWorkflowPresetId={workflowPresetId}
        setSelectedWorkflowPresetId={setWorkflowPresetId}
        updateWorkflowPreset={onUpdateWorkflowPreset}
        workflowPresets={workflowPresets}
        workflowTemplates={workflowTemplates}
      />
    )
  }

  if (activeTab === 'provider') {
    return (
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
    )
  }

  if (activeTab === 'security') {
    return <SecuritySettingsTab />
  }

  if (activeTab === 'language') {
    return (
      <div className="mt-6">
        <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
          <p className="text-sm leading-7 text-[var(--muted-foreground)]">
            {t('settings.languageHelp')}
          </p>
          <LanguageSwitcher className="mt-4" />
        </div>
      </div>
    )
  }

  return (
    <TransferSettingsTab
      conversation={transferConversation}
      isImporting={isImporting}
      messageCount={messageCount}
      onExport={onExport}
      onImport={onImport}
    />
  )
}
