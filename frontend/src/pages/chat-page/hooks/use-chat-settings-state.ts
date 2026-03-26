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

interface UseChatSettingsStateOptions {
  activeConversationId: number | null
  currentConversation: Conversation | null
  setChatError: (value: string | null) => void
  syncConversationIntoList: (conversation: Conversation) => void
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
  const [pendingConversation, setPendingConversation] =
    useState<Conversation | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<ConversationSettings>(
    defaultConversationSettings,
  )

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

    try {
      const updatedChatSettings =
        await chatApi.updateChatSettings(chatSettingsDraft)
      setChatSettings(updatedChatSettings)
      setChatSettingsDraft(updatedChatSettings)

      if (!activeConversationId) {
        setNewChatSystemPrompt(settingsDraft.systemPrompt)
        setSettingsDraft(
          buildDraftConversationSettings(
            updatedChatSettings,
            settingsDraft.systemPrompt,
          ),
        )
        onSaved()
        return
      }

      const updatedConversation = await chatApi.updateConversation(
        activeConversationId,
        {
          settings: {
            ...defaultConversationSettings,
            systemPrompt: settingsDraft.systemPrompt,
          },
        },
      )
      syncConversationIntoList(updatedConversation)
      setPendingConversation(updatedConversation)
      setSettingsDraft(updatedConversation.settings)
      onSaved()
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t('error.saveSettings'),
      )
    }
  }, [
    activeConversationId,
    chatSettingsDraft,
    settingsDraft,
    setChatError,
    syncConversationIntoList,
    t,
  ])

  const syncSettingsDraft = useCallback(() => {
    setChatSettingsDraft(chatSettings)

    if (currentConversation) {
      setSettingsDraft(currentConversation.settings)
      return
    }

    setSettingsDraft(
      buildDraftConversationSettings(chatSettings, newChatSystemPrompt),
    )
  }, [chatSettings, currentConversation, newChatSystemPrompt])

  const resetSettingsDraft = useCallback(() => {
    syncSettingsDraft()
  }, [syncSettingsDraft])

  const resetPendingConversation = useCallback(() => {
    setPendingConversation(null)
  }, [])

  const resetForNewChatSettings = useCallback(() => {
    setPendingConversation(null)
    setSettingsDraft(
      buildDraftConversationSettings(chatSettings, newChatSystemPrompt),
    )
  }, [chatSettings, newChatSystemPrompt])

  return {
    chatSettingsDraft,
    pendingConversation,
    settingsDraft,
    setChatSettingsDraft,
    setPendingConversation,
    setSettingsDraft,
    handleSaveSettings,
    resetForNewChatSettings,
    resetPendingConversation,
    resetSettingsDraft,
    syncSettingsDraft,
  }
}

function buildDraftConversationSettings(
  chatSettings: ChatSettings,
  systemPrompt: string,
): ConversationSettings {
  return {
    systemPrompt,
    model: chatSettings.model,
    temperature: chatSettings.temperature,
    maxTokens: chatSettings.maxTokens,
    contextWindowTurns: chatSettings.contextWindowTurns,
  }
}
