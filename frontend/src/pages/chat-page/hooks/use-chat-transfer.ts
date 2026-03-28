import { useState, type MutableRefObject } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import type { Conversation, Message } from '../../../types/chat'
import {
  buildConversationExportFilename,
  buildConversationMarkdown,
  clearLastConversationId,
  downloadTextFile,
  parseConversationMarkdownImport,
} from '../utils'

interface UseChatTransferOptions {
  currentConversation: Conversation | null
  pendingConversation: Conversation | null
  messages: Message[]
  locale: string
  t: I18nContextValue['t']
  setChatError: (value: string | null) => void
  showToast: (message: string, variant?: 'success' | 'error' | 'info') => void
  insertCreatedConversation: (conversation: Conversation) => void
  removeConversationFromList: (conversationId: number) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (conversationId: number, replace?: boolean) => void
  navigateHome: (replace?: boolean) => void
  setSkipAutoResume: (value: boolean) => void
  activeConversationIdRef: MutableRefObject<number | null>
  setPendingConversation: (conversation: Conversation | null) => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  resetForNewChatSettings: () => void
  resetComposer: () => void
  resetHistoryState: () => void
  reconcileConversationState: (
    conversationId: number,
    options?: { clearErrorOnSuccess?: boolean },
  ) => Promise<{ messages: Message[] } | null>
}

export function useChatTransfer({
  currentConversation,
  pendingConversation,
  messages,
  locale,
  t,
  setChatError,
  showToast,
  insertCreatedConversation,
  removeConversationFromList,
  loadConversations,
  navigateToConversation,
  navigateHome,
  setSkipAutoResume,
  activeConversationIdRef,
  setPendingConversation,
  setMessages,
  resetForNewChatSettings,
  resetComposer,
  resetHistoryState,
  reconcileConversationState,
}: UseChatTransferOptions) {
  const [isImporting, setIsImporting] = useState(false)

  async function cleanupEmptyCreatedConversation(conversationId: number) {
    const reconciled = await reconcileConversationState(conversationId, {
      clearErrorOnSuccess: false,
    })
    if (!reconciled || reconciled.messages.length > 0) {
      return
    }

    try {
      await chatApi.deleteConversation(conversationId)
    } catch {
      return
    }

    removeConversationFromList(conversationId)
    clearLastConversationId(conversationId)
    setSkipAutoResume(true)
    activeConversationIdRef.current = null
    setPendingConversation(null)
    setMessages([])
    navigateHome(true)
  }

  function handleExportConversation() {
    const exportConversation =
      currentConversation ?? pendingConversation
    if (!exportConversation || messages.length === 0) {
      return
    }

    const markdown = buildConversationMarkdown(
      exportConversation,
      messages,
      locale,
      t,
    )
    downloadTextFile(
      buildConversationExportFilename(
        exportConversation.title,
        t('chat.exportDefaultTitle'),
      ),
      markdown,
    )
  }

  async function handleImportConversation(file: File) {
    setIsImporting(true)
    setChatError(null)

    try {
      const content = await file.text()
      const payload = parseConversationMarkdownImport(
        content,
        file.name,
        t('chat.exportDefaultTitle'),
      )
      const importedConversation = await chatApi.importConversation(payload)

      setSkipAutoResume(true)
      setPendingConversation(importedConversation)
      insertCreatedConversation(importedConversation)
      await loadConversations()
      navigateToConversation(importedConversation.id)
      showToast(t('settings.importSuccess'), 'success')

      return importedConversation
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.importConversation'),
      )
      throw error
    } finally {
      setIsImporting(false)
    }
  }

  function resetForNewChat() {
    activeConversationIdRef.current = null
    setChatError(null)
    resetHistoryState()
    resetForNewChatSettings()
    resetComposer()
  }

  return {
    isImporting,
    cleanupEmptyCreatedConversation,
    handleExportConversation,
    handleImportConversation,
    resetForNewChat,
  }
}
