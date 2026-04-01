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
import type { SettingsPanelProps } from './settings-panel-types'

type SettingsPanelBodyProps = Pick<
  SettingsPanelProps,
  | 'activeTab'
  | 'availableFolders'
  | 'availableTags'
  | 'chatNumericInputDrafts'
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
  | 'onChatNumericInputChange'
  | 'onCreateKnowledgeDocument'
  | 'onCreateKnowledgeSpace'
  | 'onCreateRAGProvider'
  | 'onDeleteKnowledgeDocument'
  | 'onDeleteKnowledgeSpace'
  | 'onDeleteProvider'
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
  | 'settings'
  | 'showArchived'
  | 'transferConversation'
>

export function SettingsPanelBody({
  activeTab,
  availableFolders,
  availableTags,
  chatNumericInputDrafts,
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
  onChatNumericInputChange,
  onCreateKnowledgeDocument = async () => null,
  onCreateKnowledgeSpace = async () => null,
  onCreateRAGProvider = async () => undefined,
  onDeleteKnowledgeDocument = async () => false,
  onDeleteKnowledgeSpace = async () => false,
  onDeleteProvider,
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
  settings,
  showArchived,
  transferConversation,
}: SettingsPanelBodyProps) {
  const { t } = useI18n()
  const canReuseActiveAPIKey =
    editingProviderId == null && canReuseActivePresetAPIKey(providerState)
  const bodyClassName =
    activeTab === 'provider'
      ? 'mt-6 min-h-0 flex-1 overflow-hidden'
      : 'mt-6 min-h-0 flex-1 overflow-y-auto pr-1'

  if (activeTab === 'chat') {
    return (
      <div className={bodyClassName} data-testid="settings-panel-body">
        <ChatSettingsTab
          chatNumericInputDrafts={chatNumericInputDrafts}
          chatSettings={chatSettings}
          conversationFolder={conversationFolder}
          conversationTags={conversationTags}
          onChatNumericInputChange={onChatNumericInputChange}
          providerState={providerState}
          settings={settings}
          setConversationFolder={setConversationFolder}
          setConversationTags={setConversationTags}
          setChatSettings={setChatSettings}
          setSettings={setSettings}
        />
      </div>
    )
  }

  if (activeTab === 'history') {
    return (
      <div className={bodyClassName} data-testid="settings-panel-body">
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
      </div>
    )
  }

  if (activeTab === 'rag') {
    return (
      <div className={bodyClassName} data-testid="settings-panel-body">
        <RAGProviderSettingsTab
          activateProvider={onActivateRAGProvider}
          createProvider={onCreateRAGProvider}
          providerState={ragProviderState}
        />
      </div>
    )
  }

  if (activeTab === 'knowledge') {
    return (
      <div className={bodyClassName} data-testid="settings-panel-body">
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
      </div>
    )
  }

  if (activeTab === 'provider') {
    return (
      <div className={bodyClassName} data-testid="settings-panel-body">
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
      </div>
    )
  }

  if (activeTab === 'security') {
    return (
      <div className={bodyClassName} data-testid="settings-panel-body">
        <SecuritySettingsTab />
      </div>
    )
  }

  if (activeTab === 'language') {
    return (
      <div className={bodyClassName} data-testid="settings-panel-body">
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
    <div className={bodyClassName} data-testid="settings-panel-body">
      <TransferSettingsTab
        conversation={transferConversation}
        isImporting={isImporting}
        messageCount={messageCount}
        onExport={onExport}
        onImport={onImport}
      />
    </div>
  )
}
