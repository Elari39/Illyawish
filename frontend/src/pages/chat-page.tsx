import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
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
import { LanguageSwitcher } from '../i18n/language-switcher'
import { useI18n } from '../i18n/use-i18n'
import { chatApi } from '../lib/api'
import { cn } from '../lib/utils'
import type { Conversation } from '../types/chat'
import { ChatComposer } from './chat-page/components/chat-composer'
import { MessageList } from './chat-page/components/message-list'
import { MobileSidebar } from './chat-page/components/mobile-sidebar'
import { SidebarContent } from './chat-page/components/sidebar-content'
import { useChatSession } from './chat-page/hooks/use-chat-session'
import { useConversationList } from './chat-page/hooks/use-conversation-list'
import { useProviderSettings } from './chat-page/hooks/use-provider-settings'
import {
  DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  type ConfirmationState,
  type PromptState,
  type SettingsTab,
  type ToastState,
  type ToastVariant,
} from './chat-page/types'
import {
  clearLastConversationId,
  readDesktopSidebarCollapsedPreference,
} from './chat-page/utils'

const SettingsPanel = lazy(async () => import('./chat-page/components/settings-panel').then((module) => ({
  default: module.SettingsPanel,
})))
const ConfirmationDialog = lazy(async () => import('./chat-page/components/confirmation-dialog').then((module) => ({
  default: module.ConfirmationDialog,
})))
const PromptDialog = lazy(async () => import('./chat-page/components/prompt-dialog').then((module) => ({
  default: module.PromptDialog,
})))
const ToastViewport = lazy(async () => import('./chat-page/components/toast-viewport').then((module) => ({
  default: module.ToastViewport,
})))

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

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(
    () => readDesktopSidebarCollapsedPreference(),
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('chat')
  const [chatError, setChatError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastState[]>([])
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)

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
    showToast,
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
    isSettingsOpen,
    setChatError,
    showToast,
  })
  const displayConversation =
    currentConversation ?? chatSession.pendingConversation

  useEffect(() => {
    window.localStorage.setItem(
      DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      JSON.stringify(isDesktopSidebarCollapsed),
    )
  }, [isDesktopSidebarCollapsed])

  function showToast(message: string, variant: ToastVariant = 'info') {
    const toastId = Date.now() + Math.random()
    setToasts((previous) => [...previous, { id: toastId, message, variant }])
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== toastId))
    }, 2800)
  }

  function handleOpenSettings() {
    setActiveSettingsTab('chat')
    chatSession.syncSettingsDraft()
    setIsSettingsOpen(true)
  }

  function handleCreateNewChat() {
    if (chatSession.isSending) {
      return
    }
    conversationList.setSkipAutoResume(true)
    setSidebarOpen(false)
    conversationList.setShowArchived(false)
    chatSession.resetForNewChat()
    navigateHome()
  }

  function handleDeleteConversation(conversationId: number) {
    setConfirmation({
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
          showToast(t('common.delete'), 'success')
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
    setPromptState({
      title: t('prompt.renameConversation'),
      initialValue: conversation.title,
      confirmLabel: t('sidebar.rename'),
      onSubmit: async (nextTitle) => {
        try {
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            title: nextTitle,
          })
          conversationList.syncConversationIntoList(updatedConversation)
          showToast(t('sidebar.rename'), 'success')
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
      showToast(
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

      showToast(
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
        setIsSettingsOpen(false)
      })
    } finally {
      setIsSavingSettings(false)
    }
  }

  function handleDeleteProvider(conversation: Parameters<typeof providerSettings.handleDeleteProvider>[0]) {
    setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteProviderPreset', { name: conversation.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        await providerSettings.handleDeleteProvider(conversation)
      },
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--foreground)]">
      <MobileSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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
          setSidebarOpen(false)
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
          isDesktopSidebarCollapsed ? 'w-[72px]' : 'w-[320px]',
        )}
      >
        <SidebarContent
          collapsed={isDesktopSidebarCollapsed}
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
            onClick={() => setSidebarOpen(true)}
            type="button"
            aria-label={t('chat.openSidebar')}
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            aria-expanded={!isDesktopSidebarCollapsed}
            aria-label={
              isDesktopSidebarCollapsed
                ? t('chat.expandSidebar')
                : t('chat.collapseSidebar')
            }
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)] md:inline-flex"
            onClick={() =>
              setIsDesktopSidebarCollapsed((previous) => !previous)
            }
            title={
              isDesktopSidebarCollapsed
                ? t('chat.expandSidebar')
                : t('chat.collapseSidebar')
            }
            type="button"
          >
            {isDesktopSidebarCollapsed ? (
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
            <LanguageSwitcher />
            <Button
              className="px-3 py-2"
              disabled={chatSession.messages.length === 0}
              onClick={chatSession.handleExportConversation}
              variant="secondary"
            >
              {t('chat.export')}
            </Button>
            <Button
              className="px-3 py-2"
              onClick={handleOpenSettings}
              variant="secondary"
            >
              {t('chat.settings')}
            </Button>
            {chatSession.latestAssistantMessage && !chatSession.isSending ? (
              <Button
                className="px-3 py-2"
                onClick={() => void chatSession.handleRegenerateAssistant()}
                variant="secondary"
              >
                {t('chat.regenerate')}
              </Button>
            ) : null}
            {chatSession.isSending ? (
              <Button
                className="px-3 py-2"
                onClick={() => void chatSession.handleStopGeneration()}
                variant="danger"
              >
                {t('chat.stop')}
              </Button>
            ) : null}
          </div>
        </header>

        <MessageList
          activeConversationId={activeConversationId}
          isLoadingMessages={chatSession.isLoadingMessages}
          messages={chatSession.messages}
          latestUserMessage={chatSession.latestUserMessage}
          latestAssistantMessage={chatSession.latestAssistantMessage}
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
          onRegenerate={() => void chatSession.handleRegenerateAssistant()}
        />

        <ChatComposer
          composerFormRef={chatSession.composerFormRef}
          fileInputRef={chatSession.fileInputRef}
          composerValue={chatSession.composerValue}
          selectedImages={chatSession.selectedImages}
          editingMessageId={chatSession.editingMessageId}
          hasPendingUploads={chatSession.hasPendingUploads}
          canSubmitComposer={chatSession.canSubmitComposer}
          chatError={chatError}
          composerIsComposingRef={chatSession.composerIsComposingRef}
          onComposerChange={chatSession.setComposerValue}
          onCancelEdit={chatSession.cancelEditingMessage}
          onSubmit={(event) => void chatSession.handleSubmit(event)}
          onFilesSelected={(files) => void chatSession.handleFilesSelected(files)}
          onRemoveImage={chatSession.removeSelectedImage}
        />
      </main>

      <Suspense fallback={null}>
        <SettingsPanel
          activeTab={activeSettingsTab}
          editingProviderId={providerSettings.editingProviderId}
          isLoadingProviders={providerSettings.isLoadingProviders}
          isOpen={isSettingsOpen}
          isSavingProvider={providerSettings.isSavingProvider}
          isTestingProvider={providerSettings.isTestingProvider}
          isSaving={isSavingSettings}
          onActivateProvider={(providerId) => void providerSettings.handleActivateProvider(providerId)}
          onClose={() => setIsSettingsOpen(false)}
          onDeleteProvider={handleDeleteProvider}
          onEditProvider={providerSettings.handleEditProvider}
          onProviderFieldChange={providerSettings.handleProviderFieldChange}
          onProviderModelsChange={providerSettings.handleProviderModelsChange}
          onProviderTabChange={setActiveSettingsTab}
          onReset={chatSession.resetSettingsDraft}
          onResetProvider={providerSettings.handleStartNewProvider}
          onSave={() => void handleSaveSettings()}
          onSaveProvider={() => void providerSettings.handleSaveProvider()}
          onStartNewProvider={providerSettings.handleStartNewProvider}
          onTestProvider={() => void providerSettings.handleTestProvider()}
          providerForm={providerSettings.providerForm}
          providerState={providerSettings.providerState}
          settings={chatSession.settingsDraft}
          setSettings={chatSession.setSettingsDraft}
        />
        <ConfirmationDialog
          confirmation={confirmation}
          onClose={() => setConfirmation(null)}
        />
        <PromptDialog
          promptState={promptState}
          onClose={() => setPromptState(null)}
        />
        <ToastViewport
          toasts={toasts}
          onDismiss={(toastId) =>
            setToasts((previous) => previous.filter((toast) => toast.id !== toastId))
          }
        />
      </Suspense>
    </div>
  )
}
