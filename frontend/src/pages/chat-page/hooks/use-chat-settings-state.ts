import { useCallback, useState } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import type { Conversation, ConversationSettings } from '../../../types/chat'
import { defaultConversationSettings } from '../types'

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
  const [newChatSettings, setNewChatSettings] = useState<ConversationSettings>(
    defaultConversationSettings,
  )
  const [pendingConversation, setPendingConversation] =
    useState<Conversation | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<ConversationSettings>(
    defaultConversationSettings,
  )

  const handleSaveSettings = useCallback(async (onSaved: () => void) => {
    if (!activeConversationId) {
      setNewChatSettings(settingsDraft)
      onSaved()
      return
    }

    setChatError(null)

    try {
      const updatedConversation = await chatApi.updateConversation(
        activeConversationId,
        {
          settings: settingsDraft,
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
    settingsDraft,
    setChatError,
    syncConversationIntoList,
    t,
  ])

  const syncSettingsDraft = useCallback(() => {
    if (currentConversation) {
      setSettingsDraft(currentConversation.settings)
      return
    }
    setSettingsDraft(newChatSettings)
  }, [currentConversation, newChatSettings])

  const resetSettingsDraft = useCallback(() => {
    syncSettingsDraft()
  }, [syncSettingsDraft])

  const resetPendingConversation = useCallback(() => {
    setPendingConversation(null)
  }, [])

  const resetForNewChatSettings = useCallback(() => {
    setPendingConversation(null)
    setSettingsDraft(newChatSettings)
  }, [newChatSettings])

  return {
    pendingConversation,
    settingsDraft,
    setPendingConversation,
    setSettingsDraft,
    handleSaveSettings,
    resetForNewChatSettings,
    resetPendingConversation,
    resetSettingsDraft,
    syncSettingsDraft,
  }
}
