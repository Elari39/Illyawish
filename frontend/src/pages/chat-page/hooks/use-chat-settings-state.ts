import { useCallback, useEffect, useState } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
} from '../../../types/chat'
import {
  defaultChatSettings,
  defaultConversationSettings,
} from '../types'
import {
  buildConversationSettingsPayload,
} from './chat-settings-state/helpers'
import {
  buildConversationDraftSnapshot,
  buildNewChatDraftSnapshot,
  buildSaveSettingsPreparation,
  type ChatSettingsDraftSnapshot,
  resolveKnowledgeSpaceToggle,
} from './chat-settings-state/operations'

interface UseChatSettingsStateOptions {
  activeConversationId: Conversation['id'] | null
  currentConversation: Conversation | null
  setChatError: (value: string | null) => void
  syncConversationIntoList: (
    conversation: Conversation,
    options?: { updateCountsForVisibilityChange?: boolean },
  ) => void
  t: I18nContextValue['t']
}

export function useChatSettingsState({
  activeConversationId,
  currentConversation,
  setChatError,
  syncConversationIntoList,
  t,
}: UseChatSettingsStateOptions) {
  const [chatSettings, setChatSettings] = useState<ChatSettings>(
    defaultChatSettings,
  )
  const [chatSettingsDraft, setChatSettingsDraft] = useState<ChatSettings>(
    defaultChatSettings,
  )
  const [newChatSystemPrompt, setNewChatSystemPrompt] = useState('')
  const [newConversationFolder, setNewConversationFolder] = useState('')
  const [newConversationTagsInput, setNewConversationTagsInput] = useState('')
  const [pendingConversation, setPendingConversation] =
    useState<Conversation | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<ConversationSettings>(
    defaultConversationSettings,
  )
  const [conversationFolderDraft, setConversationFolderDraft] = useState('')
  const [conversationTagsDraft, setConversationTagsDraft] = useState('')
  const [knowledgeSpaceIdsDraft, setKnowledgeSpaceIdsDraft] = useState<number[]>([])
  const [pendingKnowledgeSpaceIds, setPendingKnowledgeSpaceIds] = useState<number[]>([])

  const applyDraftSnapshot = useCallback((snapshot: ChatSettingsDraftSnapshot) => {
    setSettingsDraft(snapshot.settingsDraft)
    setConversationFolderDraft(snapshot.conversationFolderDraft)
    setConversationTagsDraft(snapshot.conversationTagsDraft)
    setKnowledgeSpaceIdsDraft(snapshot.knowledgeSpaceIdsDraft)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadChatSettings() {
      try {
        const nextChatSettings = await chatApi.getChatSettings()
        if (cancelled) {
          return
        }

        setChatSettings(nextChatSettings)
        setChatSettingsDraft(nextChatSettings)
      } catch (error) {
        if (cancelled) {
          return
        }
        setChatError(
          error instanceof Error ? error.message : t('error.loadChatSettings'),
        )
      }
    }

    void loadChatSettings()

    return () => {
      cancelled = true
    }
  }, [setChatError, t])

  const handleSaveSettings = useCallback(async (onSaved: () => void) => {
    setChatError(null)
    const { metadataUpdate, nextFolder, nextTagsInput } =
      buildSaveSettingsPreparation({
        conversationFolderDraft,
        conversationTagsDraft,
        currentConversation,
        knowledgeSpaceIdsDraft,
      })
    const previousChatSettings = chatSettings
    const previousConversation = currentConversation
    let globalSettingsSaved = false

    try {
      const updatedChatSettings =
        await chatApi.updateChatSettings(chatSettingsDraft)
      globalSettingsSaved = true
      setChatSettings(updatedChatSettings)
      setChatSettingsDraft(updatedChatSettings)

      if (!activeConversationId) {
        setNewChatSystemPrompt(settingsDraft.systemPrompt)
        setNewConversationFolder(nextFolder)
        setNewConversationTagsInput(nextTagsInput)
        applyDraftSnapshot(
          buildNewChatDraftSnapshot({
            chatSettings: updatedChatSettings,
            systemPrompt: settingsDraft.systemPrompt,
            conversationFolderDraft: nextFolder,
            conversationTagsDraft: nextTagsInput,
          }),
        )
        onSaved()
        return
      }

      const updatedConversation = await chatApi.updateConversation(
        activeConversationId,
        {
          ...metadataUpdate,
          settings: buildConversationSettingsPayload(settingsDraft),
        },
      )
      syncConversationIntoList(updatedConversation)
      setPendingConversation(updatedConversation)
      applyDraftSnapshot(buildConversationDraftSnapshot(updatedConversation))
      onSaved()
    } catch (error) {
      if (activeConversationId && globalSettingsSaved) {
        try {
          const rolledBackChatSettings =
            await chatApi.updateChatSettings(previousChatSettings)
          setChatSettings(rolledBackChatSettings)
          setChatSettingsDraft(rolledBackChatSettings)
        } catch {
          setChatSettings(previousChatSettings)
          setChatSettingsDraft(previousChatSettings)
        }

        if (previousConversation) {
          setPendingConversation(previousConversation)
          applyDraftSnapshot(buildConversationDraftSnapshot(previousConversation))
        }
      }

      setChatError(
        error instanceof Error ? error.message : t('error.saveSettings'),
      )
    }
  }, [
    activeConversationId,
    chatSettings,
    chatSettingsDraft,
    conversationFolderDraft,
    conversationTagsDraft,
    knowledgeSpaceIdsDraft,
    currentConversation,
    settingsDraft,
    applyDraftSnapshot,
    setChatError,
    syncConversationIntoList,
    t,
  ])

  const syncSettingsDraft = useCallback(() => {
    setChatSettingsDraft(chatSettings)

    if (currentConversation) {
      applyDraftSnapshot(buildConversationDraftSnapshot(currentConversation))
      return
    }

    applyDraftSnapshot(
      buildNewChatDraftSnapshot({
        chatSettings,
        systemPrompt: newChatSystemPrompt,
        conversationFolderDraft: newConversationFolder,
        conversationTagsDraft: newConversationTagsInput,
      }),
    )
  }, [
    chatSettings,
    currentConversation,
    newChatSystemPrompt,
    newConversationFolder,
    newConversationTagsInput,
    applyDraftSnapshot,
  ])

  const resetSettingsDraft = useCallback(() => {
    syncSettingsDraft()
  }, [syncSettingsDraft])

  const resetPendingConversation = useCallback(() => {
    setPendingConversation(null)
  }, [])

  const applyChatSettings = useCallback((nextChatSettings: ChatSettings) => {
    setChatSettings(nextChatSettings)
    setChatSettingsDraft(nextChatSettings)

    if (!currentConversation && !activeConversationId) {
      applyDraftSnapshot(
        buildNewChatDraftSnapshot({
          chatSettings: nextChatSettings,
          systemPrompt: newChatSystemPrompt,
          conversationFolderDraft: newConversationFolder,
          conversationTagsDraft: newConversationTagsInput,
        }),
      )
    }
  }, [
    activeConversationId,
    currentConversation,
    newChatSystemPrompt,
    newConversationFolder,
    newConversationTagsInput,
    applyDraftSnapshot,
  ])

  const resetForNewChatSettings = useCallback(() => {
    setPendingConversation(null)
    applyDraftSnapshot(
      buildNewChatDraftSnapshot({
        chatSettings,
        systemPrompt: newChatSystemPrompt,
        conversationFolderDraft: newConversationFolder,
        conversationTagsDraft: newConversationTagsInput,
      }),
    )
    setPendingKnowledgeSpaceIds([])
  }, [
    chatSettings,
    newChatSystemPrompt,
    newConversationFolder,
    newConversationTagsInput,
    applyDraftSnapshot,
  ])

  const toggleKnowledgeSpace = useCallback(async (spaceId: number) => {
    setChatError(null)

    const previousIds = currentConversation?.knowledgeSpaceIds ?? knowledgeSpaceIdsDraft
    const nextIds = resolveKnowledgeSpaceToggle(previousIds, spaceId)

    setKnowledgeSpaceIdsDraft(nextIds)

    if (!activeConversationId || !currentConversation) {
      return
    }

    setPendingKnowledgeSpaceIds((previous) =>
      previous.includes(spaceId) ? previous : [...previous, spaceId],
    )

    try {
      const updatedConversation = await chatApi.updateConversation(activeConversationId, {
        knowledgeSpaceIds: nextIds,
      })
      syncConversationIntoList(updatedConversation)
      setPendingConversation(updatedConversation)
      setKnowledgeSpaceIdsDraft(
        buildConversationDraftSnapshot(updatedConversation).knowledgeSpaceIdsDraft,
      )
    } catch (error) {
      setKnowledgeSpaceIdsDraft(previousIds)
      setChatError(
        error instanceof Error ? error.message : t('error.saveSettings'),
      )
    } finally {
      setPendingKnowledgeSpaceIds((previous) => previous.filter((id) => id !== spaceId))
    }
  }, [
    activeConversationId,
    currentConversation,
    knowledgeSpaceIdsDraft,
    setChatError,
    syncConversationIntoList,
    t,
  ])

  return {
    chatSettingsDraft,
    conversationFolderDraft,
    conversationTagsDraft,
    knowledgeSpaceIdsDraft,
    pendingKnowledgeSpaceIds,
    pendingConversation,
    settingsDraft,
    setChatSettingsDraft,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setKnowledgeSpaceIdsDraft,
    setPendingConversation,
    setSettingsDraft,
    applyChatSettings,
    toggleKnowledgeSpace,
    handleSaveSettings,
    resetForNewChatSettings,
    resetPendingConversation,
    resetSettingsDraft,
    syncSettingsDraft,
  }
}
