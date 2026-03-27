import {
  useCallback,
  useState,
} from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Menu,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { Button } from '../components/ui/button'
import { useI18n } from '../i18n/use-i18n'
import { chatApi } from '../lib/api'
import { cn } from '../lib/utils'
import type { Conversation } from '../types/chat'
import { ChatComposer } from './chat-page/components/chat-composer'
import { ChatOverlays } from './chat-page/components/chat-overlays'
import { MessageList } from './chat-page/components/message-list'
import { MobileSidebar } from './chat-page/components/mobile-sidebar'
import { SidebarContent } from './chat-page/components/sidebar-content'
import { useChatSession } from './chat-page/hooks/use-chat-session'
import { useConversationList } from './chat-page/hooks/use-conversation-list'
import { useProviderSettings } from './chat-page/hooks/use-provider-settings'
import { useChatUIState } from './chat-page/hooks/use-chat-ui-state'
import {
  clearLastConversationId,
} from './chat-page/utils'

export function ChatPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const activeConversationId = params.conversationId
    ? Number(params.conversationId)
    : null
  const navigateToConversation = useCallback((conversationId: number, replace = false) => {
    navigate(`/chat/${conversationId}`, { replace })
  }, [navigate])
  const navigateHome = useCallback((replace = false) => {
    navigate('/chat', { replace })
  }, [navigate])

  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const uiState = useChatUIState()

  const conversationList = useConversationList({
    activeConversationId,
    onError: setChatError,
    navigateToConversation,
  })

  const currentConversation =
    conversationList.conversations.find((conversation) => conversation.id === activeConversationId) ??
    null

  const chatSession = useChatSession({
    activeConversationId,
    currentConversation,
    search: conversationList.deferredConversationSearch,
    showArchived: conversationList.showArchived,
    setChatError,
    showToast: uiState.showToast,
    insertCreatedConversation: conversationList.insertCreatedConversation,
    syncConversationIntoList: conversationList.syncConversationIntoList,
    loadConversations: conversationList.loadConversations,
    navigateToConversation,
    navigateHome,
    setSkipAutoResume: conversationList.setSkipAutoResume,
    t,
    locale,
  })

  const providerSettings = useProviderSettings({
    isSettingsOpen: uiState.isSettingsOpen,
    setChatError,
    showToast: uiState.showToast,
  })
  const displayConversation =
    currentConversation ?? chatSession.pendingConversation

  function handleOpenSettings() {
    uiState.setActiveSettingsTab('chat')
    chatSession.syncSettingsDraft()
    uiState.setIsSettingsOpen(true)
  }

  function handleCreateNewChat() {
    if (chatSession.isSending) {
      return
    }
    conversationList.setSkipAutoResume(true)
    uiState.setSidebarOpen(false)
    conversationList.setShowArchived(false)
    chatSession.resetForNewChat()
    navigateHome()
  }

  function handleDeleteConversation(conversationId: number) {
    uiState.setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteConversation'),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await chatApi.deleteConversation(conversationId)
          conversationList.removeConversationFromList(conversationId)
          clearLastConversationId(conversationId)
          if (activeConversationId === conversationId) {
            conversationList.setSkipAutoResume(true)
            chatSession.resetForNewChat()
            navigateHome(true)
          }
          uiState.showToast(t('common.delete'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.deleteConversation'),
          )
        }
      },
    })
  }

  function handleRenameConversation(conversation: Conversation) {
    uiState.setPromptState({
      title: t('prompt.renameConversation'),
      initialValue: conversation.title,
      confirmLabel: t('sidebar.rename'),
      onSubmit: async (nextTitle) => {
        try {
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            title: nextTitle,
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.rename'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.renameConversation'),
          )
        }
      },
    })
  }

  async function handleTogglePinned(conversation: Conversation) {
    try {
      const updatedConversation = await chatApi.updateConversation(conversation.id, {
        isPinned: !conversation.isPinned,
      })
      conversationList.syncConversationIntoList(updatedConversation)
      uiState.showToast(
        conversation.isPinned ? t('sidebar.unpin') : t('sidebar.pin'),
        'success',
      )
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.updateConversation'),
      )
    }
  }

  async function handleToggleArchived(conversation: Conversation) {
    try {
      const nextArchived = !conversation.isArchived
      const updatedConversation = await chatApi.updateConversation(conversation.id, {
        isArchived: nextArchived,
      })

      conversationList.syncConversationIntoList(updatedConversation)

      if (activeConversationId === conversation.id && nextArchived !== conversationList.showArchived) {
        clearLastConversationId(conversation.id)
        conversationList.setSkipAutoResume(true)
        chatSession.resetForNewChat()
        navigateHome(true)
      }

      uiState.showToast(
        nextArchived ? t('sidebar.archive') : t('sidebar.restore'),
        'success',
      )
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.archiveConversation'),
      )
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function handleSaveSettings() {
    setIsSavingSettings(true)
    setChatError(null)

    try {
      await chatSession.handleSaveSettings(() => {
        uiState.setIsSettingsOpen(false)
      })
    } finally {
      setIsSavingSettings(false)
    }
  }

  function handleDeleteProvider(conversation: Parameters<typeof providerSettings.handleDeleteProvider>[0]) {
    uiState.setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteProviderPreset', { name: conversation.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        await providerSettings.handleDeleteProvider(conversation)
      },
    })
  }

  async function handleImportConversation(file: File) {
    await chatSession.handleImportConversation(file)
    uiState.setIsSettingsOpen(false)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--foreground)]">
      <MobileSidebar
        isOpen={uiState.sidebarOpen}
        onClose={() => uiState.setSidebarOpen(false)}
        currentConversationId={activeConversationId}
        conversations={conversationList.conversations}
        hasMoreConversations={conversationList.hasMoreConversations}
        searchValue={conversationList.conversationSearch}
        showArchived={conversationList.showArchived}
        isLoading={conversationList.isLoadingConversations}
        isLoadingMore={conversationList.isLoadingMoreConversations}
        onSearchChange={conversationList.setConversationSearch}
        onToggleArchived={conversationList.setShowArchived}
        onLoadMore={() => void conversationList.loadConversations({ append: true })}
        onSelectConversation={(conversationId) => {
          navigateToConversation(conversationId)
          uiState.setSidebarOpen(false)
        }}
        onRenameConversation={handleRenameConversation}
        onTogglePinned={handleTogglePinned}
        onToggleArchivedConversation={handleToggleArchived}
        onDeleteConversation={handleDeleteConversation}
        onCreateChat={handleCreateNewChat}
        username={user?.username ?? ''}
        onLogout={handleLogout}
      />

      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-[var(--line)] bg-[var(--sidebar-bg)] transition-[width] duration-200 md:flex',
          uiState.isDesktopSidebarCollapsed ? 'w-[72px]' : 'w-[272px]',
        )}
      >
        <SidebarContent
          key={uiState.isDesktopSidebarCollapsed ? 'desktop-sidebar-collapsed' : 'desktop-sidebar-expanded'}
          collapsed={uiState.isDesktopSidebarCollapsed}
          variant="desktop"
          currentConversationId={activeConversationId}
          conversations={conversationList.conversations}
          hasMoreConversations={conversationList.hasMoreConversations}
          searchValue={conversationList.conversationSearch}
          showArchived={conversationList.showArchived}
          isLoading={conversationList.isLoadingConversations}
          isLoadingMore={conversationList.isLoadingMoreConversations}
          onSearchChange={conversationList.setConversationSearch}
          onToggleArchived={conversationList.setShowArchived}
          onLoadMore={() => void conversationList.loadConversations({ append: true })}
          onSelectConversation={navigateToConversation}
          onRenameConversation={handleRenameConversation}
          onTogglePinned={handleTogglePinned}
          onToggleArchivedConversation={handleToggleArchived}
          onDeleteConversation={handleDeleteConversation}
          onCreateChat={handleCreateNewChat}
          username={user?.username ?? ''}
          onLogout={handleLogout}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 md:px-8">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-black/5 md:hidden"
            onClick={() => uiState.setSidebarOpen(true)}
            type="button"
            aria-label={t('chat.openSidebar')}
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            aria-expanded={!uiState.isDesktopSidebarCollapsed}
            aria-label={
              uiState.isDesktopSidebarCollapsed
                ? t('chat.expandSidebar')
                : t('chat.collapseSidebar')
            }
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)] md:inline-flex"
            onClick={() =>
              uiState.setIsDesktopSidebarCollapsed((previous) => !previous)
            }
            title={
              uiState.isDesktopSidebarCollapsed
                ? t('chat.expandSidebar')
                : t('chat.collapseSidebar')
            }
            type="button"
          >
            {uiState.isDesktopSidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium text-[var(--foreground)]">
              {displayConversation?.title
                ?? (activeConversationId ? t('chat.loadingConversation') : t('chat.newConversation'))}
            </h1>
            {displayConversation ? (
              <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                {displayConversation.settings.model || t('chat.defaultModel')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="px-3 py-2"
              onClick={handleOpenSettings}
              variant="secondary"
            >
              {t('chat.settings')}
            </Button>
            {user?.role === 'admin' ? (
              <Button
                className="px-3 py-2"
                onClick={() => navigate('/admin')}
                variant="secondary"
              >
                {t('chat.admin')}
              </Button>
            ) : null}
          </div>
        </header>

        <MessageList
          activeConversationId={activeConversationId}
          isLoadingMessages={chatSession.isLoadingMessages}
          messages={chatSession.messages}
          latestUserMessage={chatSession.latestUserMessage}
          isSending={chatSession.isSending}
          editingMessageId={chatSession.editingMessageId}
          hasConversationShell={displayConversation != null}
          conversations={conversationList.conversations}
          restorableConversationId={conversationList.restorableConversationId}
          viewportRef={chatSession.messageViewportRef}
          onContinueLast={() => {
            if (conversationList.restorableConversationId) {
              navigateToConversation(conversationList.restorableConversationId)
            }
          }}
          onEditMessage={chatSession.startEditingMessage}
          onRetryMessage={(message) => void chatSession.handleRetryAssistant(message)}
          onRegenerateMessage={(message) => void chatSession.handleRegenerateAssistant(message)}
        />

        <ChatComposer
          composerFormRef={chatSession.composerFormRef}
          fileInputRef={chatSession.fileInputRef}
          composerValue={chatSession.composerValue}
          selectedAttachments={chatSession.selectedAttachments}
          editingMessageId={chatSession.editingMessageId}
          hasPendingUploads={chatSession.hasPendingUploads}
          canSubmitComposer={chatSession.canSubmitComposer}
          isSending={chatSession.isSending}
          chatError={chatError}
          composerIsComposingRef={chatSession.composerIsComposingRef}
          onComposerChange={chatSession.setComposerValue}
          onCancelEdit={chatSession.cancelEditingMessage}
          onStopGeneration={() => void chatSession.handleStopGeneration()}
          onSubmit={(event) => void chatSession.handleSubmit(event)}
          onFilesSelected={(files) => void chatSession.handleFilesSelected(files)}
          onRemoveAttachment={chatSession.removeSelectedAttachment}
        />
      </main>

      <ChatOverlays
        activeTab={uiState.activeSettingsTab}
        chatSettings={chatSession.chatSettingsDraft}
        confirmation={uiState.confirmation}
        editingProviderId={providerSettings.editingProviderId}
        isLoadingProviders={providerSettings.isLoadingProviders}
        isOpen={uiState.isSettingsOpen}
        isSaving={isSavingSettings}
        isImporting={chatSession.isImporting}
        isSavingProvider={providerSettings.isSavingProvider}
        isTestingProvider={providerSettings.isTestingProvider}
        messageCount={chatSession.messages.length}
        onExport={chatSession.handleExportConversation}
        onImport={(file) => void handleImportConversation(file)}
        onActivateProvider={providerSettings.handleActivateProvider}
        onCloseConfirmation={() => uiState.setConfirmation(null)}
        onClosePrompt={() => uiState.setPromptState(null)}
        onCloseSettings={() => uiState.setIsSettingsOpen(false)}
        onDeleteProvider={handleDeleteProvider}
        onDismissToast={(toastId) =>
          uiState.setToasts((previous) =>
            previous.filter((toast) => toast.id !== toastId),
          )
        }
        onEditProvider={providerSettings.handleEditProvider}
        onProviderFieldChange={providerSettings.handleProviderFieldChange}
        onProviderModelsChange={providerSettings.handleProviderModelsChange}
        onProviderTabChange={uiState.setActiveSettingsTab}
        onReset={chatSession.resetSettingsDraft}
        onResetProvider={providerSettings.handleStartNewProvider}
        onSave={handleSaveSettings}
        onSaveProvider={providerSettings.handleSaveProvider}
        onStartNewProvider={providerSettings.handleStartNewProvider}
        onTestProvider={providerSettings.handleTestProvider}
        promptState={uiState.promptState}
        providerForm={providerSettings.providerForm}
        providerState={providerSettings.providerState}
        transferConversation={displayConversation}
        settings={chatSession.settingsDraft}
        setChatSettings={chatSession.setChatSettingsDraft}
        setSettings={chatSession.setSettingsDraft}
        toasts={uiState.toasts}
      />
    </div>
  )
}
