import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
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
import { ChatContextBar } from './chat-page/components/chat-context-bar'
import { ChatOverlays } from './chat-page/components/chat-overlays'
import { buildExecutionPanelModel } from './chat-page/components/execution-panel-model'
import { MessageList } from './chat-page/components/message-list'
import { MobileSidebar } from './chat-page/components/mobile-sidebar'
import { SidebarContent } from './chat-page/components/sidebar-content'
import { useChatSession } from './chat-page/hooks/use-chat-session'
import { useConversationList } from './chat-page/hooks/use-conversation-list'
import { useAgentWorkspace } from './chat-page/hooks/use-agent-workspace'
import { useProviderSettings } from './chat-page/hooks/use-provider-settings'
import { useChatUIState } from './chat-page/hooks/use-chat-ui-state'
import { parseConversationTagsInput } from './chat-page/conversation-list-utils'
import {
  decodeProviderModelValue,
  resolveEffectiveProviderModel,
} from './chat-page/provider-model-utils'
import {
  clearLastConversationId,
} from './chat-page/utils'

export function ChatPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const activeConversationId = params.conversationId ?? null
  const navigateToConversation = useCallback((conversationId: Conversation['id'], replace = false) => {
    navigate(`/chat/s/${conversationId}`, { replace })
  }, [navigate])
  const navigateHome = useCallback((replace = false) => {
    navigate('/chat', { replace })
  }, [navigate])

  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [isComposerExpanded, setIsComposerExpanded] = useState(false)
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
    removeConversationFromList: conversationList.removeConversationFromList,
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
  const agentWorkspace = useAgentWorkspace({
    isSettingsOpen: uiState.isSettingsOpen,
    setChatError,
  })
  const interactionDisabled = chatSession.isSending
  const displayConversation =
    currentConversation ?? chatSession.pendingConversation
  const contextBarSettings =
    activeConversationId && displayConversation
      ? displayConversation.settings
      : chatSession.settingsDraft
  const contextBarWorkflowPresetId =
    activeConversationId && displayConversation
      ? displayConversation.workflowPresetId ?? null
      : chatSession.workflowPresetIdDraft
  const contextBarKnowledgeSpaceIds =
    activeConversationId && displayConversation
      ? displayConversation.knowledgeSpaceIds ?? []
      : chatSession.knowledgeSpaceIdsDraft
  const executionPanelModel = buildExecutionPanelModel(
    chatSession.executionEvents,
    chatSession.pendingConfirmationId,
  )
  const isHeroState =
    activeConversationId == null &&
    chatSession.messages.length === 0 &&
    !chatSession.isLoadingMessages
  const headerTitle = isHeroState
    ? ''
    : displayConversation?.title
      ?? (activeConversationId ? t('chat.loadingConversation') : '')

  useEffect(() => {
    if (chatSession.composerValue.trim().length === 0) {
      setIsComposerExpanded(false)
    }
  }, [chatSession.composerValue])

  function handleOpenSettings(tab: Parameters<typeof uiState.setActiveSettingsTab>[0] = 'chat') {
    uiState.setActiveSettingsTab(tab)
    chatSession.syncSettingsDraft()
    uiState.setIsSettingsOpen(true)
  }

  function handleCreateNewChat() {
    if (interactionDisabled) {
      return
    }
    setIsComposerExpanded(false)
    conversationList.setSkipAutoResume(true)
    uiState.setSidebarOpen(false)
    conversationList.setShowArchived(false)
    chatSession.resetForNewChat()
    navigateHome()
  }

  function handleDeleteConversation(conversationId: Conversation['id']) {
    if (interactionDisabled) {
      return
    }

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
    if (interactionDisabled) {
      return
    }

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
    if (interactionDisabled) {
      return
    }

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
    if (interactionDisabled) {
      return
    }

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

  async function handleProviderModelChange(value: string) {
    const nextSelection = decodeProviderModelValue(value)
    if (!nextSelection) {
      return
    }

    if (!activeConversationId) {
      chatSession.setSettingsDraft((previous) => ({
        ...previous,
        providerPresetId: nextSelection.providerPresetId,
        model: nextSelection.model,
      }))
      return
    }

    try {
      const updatedConversation = await chatApi.updateConversation(activeConversationId, {
        settings: {
          ...contextBarSettings,
          providerPresetId: nextSelection.providerPresetId,
          model: nextSelection.model,
        },
      })
      conversationList.syncConversationIntoList(updatedConversation)
      chatSession.setSettingsDraft(updatedConversation.settings)
      uiState.showToast(nextSelection.model, 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.saveSettings'),
      )
    }
  }

  async function handleSetDefaultProviderModel() {
    const selection = resolveEffectiveProviderModel(
      providerSettings.providerState,
      contextBarSettings,
      chatSession.chatSettingsDraft,
    )

    if (selection.providerPresetId == null || selection.model === '') {
      return
    }

    try {
      const updatedChatSettings = await chatApi.updateChatSettings({
        ...chatSession.chatSettingsDraft,
        providerPresetId: selection.providerPresetId,
        model: selection.model,
      })
      chatSession.applyChatSettings(updatedChatSettings)
      uiState.showToast(t('chatContext.setAsDefault'), 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.saveSettings'),
      )
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

  async function handleDeleteWorkflowPreset(presetId: number) {
    const preset = agentWorkspace.workflowPresets.find((entry) => entry.id === presetId)
    if (!preset) {
      return false
    }

    uiState.setConfirmation({
      title: t('common.delete'),
      description: t('confirm.deleteWorkflowPreset', { name: preset.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        const deleted = await agentWorkspace.deleteWorkflowPreset(presetId)
        if (!deleted) {
          return
        }

        if (chatSession.workflowPresetIdDraft === presetId) {
          chatSession.setWorkflowPresetIdDraft(null)
        }

        if (currentConversation?.workflowPresetId === presetId) {
          try {
            const updatedConversation = await chatApi.updateConversation(currentConversation.id, {
              workflowPresetId: null,
            })
            conversationList.syncConversationIntoList(updatedConversation)
          } catch (error) {
            setChatError(
              error instanceof Error
                ? error.message
                : t('error.updateWorkflowPresetSelection'),
            )
          }
        }
      },
    })

    return false
  }

  function handleMoveConversationToFolder(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    uiState.setPromptState({
      title: t('sidebar.moveToFolder'),
      initialValue: conversation.folder,
      confirmLabel: t('sidebar.moveToFolder'),
      onSubmit: async (value) => {
        try {
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            folder: value.trim(),
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.moveToFolder'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.updateConversation'),
          )
        }
      },
    })
  }

  function handleAddConversationTags(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    uiState.setPromptState({
      title: t('sidebar.addTags'),
      initialValue: '',
      confirmLabel: t('sidebar.addTags'),
      onSubmit: async (value) => {
        try {
          const tagsToAdd = parseConversationTagsInput(value)
          if (tagsToAdd.length === 0) {
            return
          }
          const nextTags = Array.from(new Set([...conversation.tags, ...tagsToAdd]))
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            tags: nextTags,
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.addTags'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.updateConversation'),
          )
        }
      },
    })
  }

  function handleRemoveConversationTags(conversation: Conversation) {
    if (interactionDisabled) {
      return
    }

    uiState.setPromptState({
      title: t('sidebar.removeTags'),
      initialValue: '',
      confirmLabel: t('sidebar.removeTags'),
      onSubmit: async (value) => {
        try {
          const tagsToRemove = parseConversationTagsInput(value).map((tag) => tag.toLowerCase())
          if (tagsToRemove.length === 0) {
            return
          }
          const nextTags = conversation.tags.filter(
            (tag) => !tagsToRemove.includes(tag.toLowerCase()),
          )
          const updatedConversation = await chatApi.updateConversation(conversation.id, {
            tags: nextTags,
          })
          conversationList.syncConversationIntoList(updatedConversation)
          uiState.showToast(t('sidebar.removeTags'), 'success')
        } catch (error) {
          setChatError(
            error instanceof Error
              ? error.message
              : t('error.updateConversation'),
          )
        }
      },
    })
  }

  async function runBulkConversationUpdate(
    buildPayload: (conversation: Conversation, value: string) => Parameters<typeof chatApi.updateConversation>[1],
    value: string,
  ) {
    const selectedConversations = conversationList.conversations.filter((conversation) =>
      conversationList.selectedConversationIds.includes(conversation.id),
    )

    let successCount = 0
    let failureCount = 0

    for (const conversation of selectedConversations) {
      try {
        const updatedConversation = await chatApi.updateConversation(
          conversation.id,
          buildPayload(conversation, value),
        )
        conversationList.syncConversationIntoList(updatedConversation)
        successCount += 1
      } catch {
        failureCount += 1
      }
    }

    conversationList.clearSelectedConversations()
    if (successCount > 0) {
      uiState.showToast(
        failureCount > 0
          ? t('sidebar.bulkUpdatePartial', { successCount, failureCount })
          : t('sidebar.bulkUpdateSuccess', { count: successCount }),
        failureCount > 0 ? 'info' : 'success',
      )
    }
    if (failureCount > 0) {
      setChatError(t('error.updateConversation'))
    }
  }

  function handleBulkMoveToFolder() {
    uiState.setPromptState({
      title: t('sidebar.moveSelected'),
      initialValue: '',
      confirmLabel: t('sidebar.moveSelected'),
      onSubmit: async (value) => {
        await runBulkConversationUpdate(
          (_conversation, nextValue) => ({ folder: nextValue.trim() }),
          value,
        )
      },
    })
  }

  function handleBulkAddTags() {
    uiState.setPromptState({
      title: t('sidebar.addTagsSelected'),
      initialValue: '',
      confirmLabel: t('sidebar.addTagsSelected'),
      onSubmit: async (value) => {
        await runBulkConversationUpdate(
          (conversation, nextValue) => {
            const tagsToAdd = parseConversationTagsInput(nextValue)
            return {
              tags: Array.from(new Set([...conversation.tags, ...tagsToAdd])),
            }
          },
          value,
        )
      },
    })
  }

  function handleBulkRemoveTags() {
    uiState.setPromptState({
      title: t('sidebar.removeTagsSelected'),
      initialValue: '',
      confirmLabel: t('sidebar.removeTagsSelected'),
      onSubmit: async (value) => {
        await runBulkConversationUpdate(
          (conversation, nextValue) => {
            const tagsToRemove = parseConversationTagsInput(nextValue).map((tag) => tag.toLowerCase())
            return {
              tags: conversation.tags.filter(
                (tag) => !tagsToRemove.includes(tag.toLowerCase()),
              ),
            }
          },
          value,
        )
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
        interactionDisabled={interactionDisabled}
        currentConversationId={activeConversationId}
        conversations={conversationList.conversations}
        hasMoreConversations={conversationList.hasMoreConversations}
        searchValue={conversationList.conversationSearch}
        showArchived={conversationList.showArchived}
        availableFolders={conversationList.availableFolders}
        availableTags={conversationList.availableTags}
        selectedFolder={conversationList.selectedFolder}
        selectedTags={conversationList.selectedTags}
        selectionMode={conversationList.selectionMode}
        selectedConversationIds={conversationList.selectedConversationIds}
        isLoading={conversationList.isLoadingConversations}
        isLoadingMore={conversationList.isLoadingMoreConversations}
        onSearchChange={conversationList.setConversationSearch}
        onToggleArchived={conversationList.setShowArchived}
        onSelectFolder={conversationList.setSelectedFolder}
        onToggleTag={conversationList.toggleSelectedTag}
        onSetSelectionMode={conversationList.setSelectionMode}
        onToggleConversationSelection={conversationList.toggleConversationSelection}
        onMoveConversationToFolder={handleMoveConversationToFolder}
        onAddConversationTags={handleAddConversationTags}
        onRemoveConversationTags={handleRemoveConversationTags}
        onBulkMoveToFolder={handleBulkMoveToFolder}
        onBulkAddTags={handleBulkAddTags}
        onBulkRemoveTags={handleBulkRemoveTags}
        onLoadMore={() => void conversationList.loadConversations({ append: true })}
        onSelectConversation={(conversationId) => {
          if (interactionDisabled) {
            return
          }
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
          desktopSidebarExpanded={!uiState.isDesktopSidebarCollapsed}
          interactionDisabled={interactionDisabled}
          currentConversationId={activeConversationId}
          conversations={conversationList.conversations}
          hasMoreConversations={conversationList.hasMoreConversations}
          searchValue={conversationList.conversationSearch}
          showArchived={conversationList.showArchived}
          availableFolders={conversationList.availableFolders}
          availableTags={conversationList.availableTags}
          selectedFolder={conversationList.selectedFolder}
          selectedTags={conversationList.selectedTags}
          selectionMode={conversationList.selectionMode}
          selectedConversationIds={conversationList.selectedConversationIds}
          isLoading={conversationList.isLoadingConversations}
          isLoadingMore={conversationList.isLoadingMoreConversations}
          onSearchChange={conversationList.setConversationSearch}
          onToggleArchived={conversationList.setShowArchived}
          onSelectFolder={conversationList.setSelectedFolder}
          onToggleTag={conversationList.toggleSelectedTag}
          onSetSelectionMode={conversationList.setSelectionMode}
          onToggleConversationSelection={conversationList.toggleConversationSelection}
          onMoveConversationToFolder={handleMoveConversationToFolder}
          onAddConversationTags={handleAddConversationTags}
          onRemoveConversationTags={handleRemoveConversationTags}
          onBulkMoveToFolder={handleBulkMoveToFolder}
          onBulkAddTags={handleBulkAddTags}
          onBulkRemoveTags={handleBulkRemoveTags}
          onLoadMore={() => void conversationList.loadConversations({ append: true })}
          onSelectConversation={(conversationId) => {
            if (interactionDisabled) {
              return
            }
            navigateToConversation(conversationId)
          }}
          onRenameConversation={handleRenameConversation}
          onTogglePinned={handleTogglePinned}
          onToggleArchivedConversation={handleToggleArchived}
          onDeleteConversation={handleDeleteConversation}
          onToggleDesktopSidebar={() =>
            uiState.setIsDesktopSidebarCollapsed((previous) => !previous)
          }
          onCreateChat={handleCreateNewChat}
          username={user?.username ?? ''}
          onLogout={handleLogout}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)] md:hidden"
              onClick={() => uiState.setSidebarOpen(true)}
              type="button"
              aria-label={t('chat.openSidebar')}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span
              className="truncate text-sm font-semibold text-[var(--foreground)] md:text-base"
              data-testid="chat-header-site-name"
            >
              {t('app.name')}
            </span>
          </div>

          <div className="min-w-0 text-center">
            {headerTitle ? (
              <h1
                className="truncate text-sm font-medium text-[var(--foreground)] md:text-base"
                data-testid="chat-header-title"
              >
                {headerTitle}
              </h1>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              className="px-3 py-2"
              onClick={() => handleOpenSettings('chat')}
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

        {isHeroState ? (
          <div
            className={cn(
              'flex flex-1 px-4 md:px-8',
              isComposerExpanded
                ? 'min-h-0 py-6'
                : 'items-center justify-center py-10',
            )}
          >
            <div
              className={cn(
                'w-full max-w-4xl',
                isComposerExpanded
                  ? 'mx-auto flex h-full min-h-0 flex-col gap-6'
                  : 'space-y-8',
              )}
            >
              <div className="mx-auto max-w-2xl">
                <MessageList
                  activeConversationId={activeConversationId}
                  hasMoreMessages={chatSession.hasMoreMessages}
                  isLoadingMessages={chatSession.isLoadingMessages}
                  isLoadingOlderMessages={chatSession.isLoadingOlderMessages}
                  messages={chatSession.messages}
                  latestUserMessage={chatSession.latestUserMessage}
                  latestAssistantMessage={chatSession.latestAssistantMessage}
                  isSending={chatSession.isSending}
                  editingMessageId={chatSession.editingMessageId}
                  executionPanelModel={executionPanelModel}
                  hasConversationShell={displayConversation != null}
                  viewportRef={chatSession.messageViewportRef}
                  onShowToast={uiState.showToast}
                  onEditMessage={chatSession.startEditingMessage}
                  onLoadMore={() => void chatSession.loadOlderMessages()}
                  onConfirmToolCall={chatSession.handleConfirmToolCall}
                  onRetryMessage={(message) => void chatSession.handleRetryAssistant(message)}
                  onRegenerateMessage={(message) => void chatSession.handleRegenerateAssistant(message)}
                />
              </div>

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
                layoutMode="hero"
                isExpanded={isComposerExpanded}
                modelControl={
                  <ChatContextBar
                    compact
                    compactVariant="model"
                    chatSettings={chatSession.chatSettingsDraft}
                    settings={contextBarSettings}
                    providerState={providerSettings.providerState}
                    knowledgeSpaceIds={contextBarKnowledgeSpaceIds}
                    workflowPresetId={contextBarWorkflowPresetId}
                    workflowPresets={agentWorkspace.workflowPresets}
                    knowledgeSpaces={agentWorkspace.knowledgeSpaces}
                    isDisabled={interactionDisabled}
                    onOpenKnowledgeSettings={() => handleOpenSettings('knowledge')}
                    onOpenWorkflowSettings={() => handleOpenSettings('workflow')}
                    onProviderModelChange={(value) => void handleProviderModelChange(value)}
                    onSetAsDefault={() => void handleSetDefaultProviderModel()}
                  />
                }
                onToggleExpanded={setIsComposerExpanded}
                onComposerChange={chatSession.setComposerValue}
                onCancelEdit={chatSession.cancelEditingMessage}
                onStopGeneration={() => void chatSession.handleStopGeneration()}
                onSubmit={(event) => void chatSession.handleSubmit(event)}
                onFilesSelected={(files) => void chatSession.handleFilesSelected(files)}
                onRemoveAttachment={chatSession.removeSelectedAttachment}
              />
            </div>
          </div>
        ) : (
          <>
            <MessageList
              activeConversationId={activeConversationId}
              hasMoreMessages={chatSession.hasMoreMessages}
              isLoadingMessages={chatSession.isLoadingMessages}
              isLoadingOlderMessages={chatSession.isLoadingOlderMessages}
              messages={chatSession.messages}
              latestUserMessage={chatSession.latestUserMessage}
              latestAssistantMessage={chatSession.latestAssistantMessage}
              isSending={chatSession.isSending}
              editingMessageId={chatSession.editingMessageId}
              executionPanelModel={executionPanelModel}
              hasConversationShell={displayConversation != null}
              viewportRef={chatSession.messageViewportRef}
              onShowToast={uiState.showToast}
              onEditMessage={chatSession.startEditingMessage}
              onLoadMore={() => void chatSession.loadOlderMessages()}
              onConfirmToolCall={chatSession.handleConfirmToolCall}
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
              layoutMode="docked"
              isExpanded={isComposerExpanded}
              leftContextBar={
                <ChatContextBar
                  compact
                  compactVariant="secondary"
                  chatSettings={chatSession.chatSettingsDraft}
                  settings={contextBarSettings}
                  providerState={providerSettings.providerState}
                  knowledgeSpaceIds={contextBarKnowledgeSpaceIds}
                  workflowPresetId={contextBarWorkflowPresetId}
                  workflowPresets={agentWorkspace.workflowPresets}
                  knowledgeSpaces={agentWorkspace.knowledgeSpaces}
                  isDisabled={interactionDisabled}
                  onOpenKnowledgeSettings={() => handleOpenSettings('knowledge')}
                  onOpenWorkflowSettings={() => handleOpenSettings('workflow')}
                  onProviderModelChange={(value) => void handleProviderModelChange(value)}
                  onSetAsDefault={() => void handleSetDefaultProviderModel()}
                />
              }
              modelControl={
                <ChatContextBar
                  compact
                  compactVariant="model"
                  chatSettings={chatSession.chatSettingsDraft}
                  settings={contextBarSettings}
                  providerState={providerSettings.providerState}
                  knowledgeSpaceIds={contextBarKnowledgeSpaceIds}
                  workflowPresetId={contextBarWorkflowPresetId}
                  workflowPresets={agentWorkspace.workflowPresets}
                  knowledgeSpaces={agentWorkspace.knowledgeSpaces}
                  isDisabled={interactionDisabled}
                  onOpenKnowledgeSettings={() => handleOpenSettings('knowledge')}
                  onOpenWorkflowSettings={() => handleOpenSettings('workflow')}
                  onProviderModelChange={(value) => void handleProviderModelChange(value)}
                  onSetAsDefault={() => void handleSetDefaultProviderModel()}
                />
              }
              onToggleExpanded={setIsComposerExpanded}
              onComposerChange={chatSession.setComposerValue}
              onCancelEdit={chatSession.cancelEditingMessage}
              onStopGeneration={() => void chatSession.handleStopGeneration()}
              onSubmit={(event) => void chatSession.handleSubmit(event)}
              onFilesSelected={(files) => void chatSession.handleFilesSelected(files)}
              onRemoveAttachment={chatSession.removeSelectedAttachment}
            />
          </>
        )}
      </main>

      <ChatOverlays
        activeTab={uiState.activeSettingsTab}
        chatSettings={chatSession.chatSettingsDraft}
        confirmation={uiState.confirmation}
        conversationFolder={chatSession.conversationFolderDraft}
        conversationTags={chatSession.conversationTagsDraft}
        showArchived={conversationList.showArchived}
        availableFolders={conversationList.availableFolders}
        availableTags={conversationList.availableTags}
        selectedFolder={conversationList.selectedFolder}
        selectedTags={conversationList.selectedTags}
        workflowPresetId={chatSession.workflowPresetIdDraft}
        knowledgeSpaceIds={chatSession.knowledgeSpaceIdsDraft}
        pendingKnowledgeSpaceIds={chatSession.pendingKnowledgeSpaceIds}
        editingProviderId={providerSettings.editingProviderId}
        isLoadingProviders={providerSettings.isLoadingProviders}
        isOpen={uiState.isSettingsOpen}
        isSaving={isSavingSettings}
        isImporting={chatSession.isImporting}
        isSavingProvider={providerSettings.isSavingProvider}
        isTestingProvider={providerSettings.isTestingProvider}
        messageCount={chatSession.messages.length}
        selectedConversationIds={conversationList.selectedConversationIds}
        selectionMode={conversationList.selectionMode}
        onExport={chatSession.handleExportConversation}
        onImport={(file) => void handleImportConversation(file)}
        onActivateProvider={providerSettings.handleActivateProvider}
        onCreateRAGProvider={agentWorkspace.createRAGProvider}
        onActivateRAGProvider={agentWorkspace.activateRAGProvider}
        onLoadKnowledgeDocuments={agentWorkspace.loadKnowledgeDocuments}
        onToggleKnowledgeSpace={(space) => chatSession.toggleKnowledgeSpace(space.id)}
        onCreateKnowledgeSpace={agentWorkspace.createKnowledgeSpace}
        onUpdateKnowledgeSpace={agentWorkspace.updateKnowledgeSpace}
        onDeleteKnowledgeSpace={agentWorkspace.deleteKnowledgeSpace}
        onCreateKnowledgeDocument={agentWorkspace.createKnowledgeDocument}
        onUpdateKnowledgeDocument={agentWorkspace.updateKnowledgeDocument}
        onDeleteKnowledgeDocument={agentWorkspace.deleteKnowledgeDocument}
        onUploadKnowledgeDocuments={agentWorkspace.uploadKnowledgeDocuments}
        onReplaceKnowledgeDocumentFile={agentWorkspace.replaceKnowledgeDocumentFile}
        onCreateWorkflowPreset={agentWorkspace.createWorkflowPreset}
        onUpdateWorkflowPreset={agentWorkspace.updateWorkflowPreset}
        onDeleteWorkflowPreset={handleDeleteWorkflowPreset}
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
        ragProviderState={agentWorkspace.ragProviders}
        knowledgeSpaces={agentWorkspace.knowledgeSpaces}
        knowledgeDocuments={agentWorkspace.knowledgeDocuments}
        workflowTemplates={agentWorkspace.workflowTemplates}
        workflowPresets={agentWorkspace.workflowPresets}
        transferConversation={displayConversation}
        settings={chatSession.settingsDraft}
        setChatSettings={chatSession.setChatSettingsDraft}
        setConversationFolder={chatSession.setConversationFolderDraft}
        setConversationTags={chatSession.setConversationTagsDraft}
        onToggleArchived={conversationList.setShowArchived}
        onSelectFolder={conversationList.setSelectedFolder}
        onToggleTag={conversationList.toggleSelectedTag}
        onSetSelectionMode={conversationList.setSelectionMode}
        onBulkMoveToFolder={handleBulkMoveToFolder}
        onBulkAddTags={handleBulkAddTags}
        onBulkRemoveTags={handleBulkRemoveTags}
        setWorkflowPresetId={chatSession.setWorkflowPresetIdDraft}
        setSettings={chatSession.setSettingsDraft}
        toasts={uiState.toasts}
      />
    </div>
  )
}
