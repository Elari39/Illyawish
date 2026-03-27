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
  const [newConversationFolder, setNewConversationFolder] = useState('')
  const [newConversationTagsInput, setNewConversationTagsInput] = useState('')
  const [pendingConversation, setPendingConversation] =
    useState<Conversation | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<ConversationSettings>(
    defaultConversationSettings,
  )
  const [conversationFolderDraft, setConversationFolderDraft] = useState('')
  const [conversationTagsDraft, setConversationTagsDraft] = useState('')

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
    const nextFolder = sanitizeConversationFolder(conversationFolderDraft)
    const nextTags = parseConversationTags(conversationTagsDraft)
    const metadataUpdate = buildConversationMetadataUpdate(
      nextFolder,
      nextTags,
      currentConversation,
    )

    try {
      const updatedChatSettings =
        await chatApi.updateChatSettings(chatSettingsDraft)
      setChatSettings(updatedChatSettings)
      setChatSettingsDraft(updatedChatSettings)

      if (!activeConversationId) {
        setNewChatSystemPrompt(settingsDraft.systemPrompt)
        setNewConversationFolder(nextFolder)
        setNewConversationTagsInput(
          nextTags.join(', '),
        )
        setSettingsDraft(
          buildDraftConversationSettings(
            updatedChatSettings,
            settingsDraft.systemPrompt,
          ),
        )
        setConversationFolderDraft(nextFolder)
        setConversationTagsDraft(nextTags.join(', '))
        onSaved()
        return
      }

      const updatedConversation = await chatApi.updateConversation(
        activeConversationId,
        {
          ...metadataUpdate,
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
    conversationFolderDraft,
    conversationTagsDraft,
    currentConversation,
    settingsDraft,
    setChatError,
    syncConversationIntoList,
    t,
  ])

  const syncSettingsDraft = useCallback(() => {
    setChatSettingsDraft(chatSettings)

    if (currentConversation) {
      setSettingsDraft(currentConversation.settings)
      setConversationFolderDraft(currentConversation.folder)
      setConversationTagsDraft(currentConversation.tags.join(', '))
      return
    }

    setSettingsDraft(
      buildDraftConversationSettings(chatSettings, newChatSystemPrompt),
    )
    setConversationFolderDraft(newConversationFolder)
    setConversationTagsDraft(newConversationTagsInput)
  }, [
    chatSettings,
    currentConversation,
    newChatSystemPrompt,
    newConversationFolder,
    newConversationTagsInput,
  ])

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
    setConversationFolderDraft(newConversationFolder)
    setConversationTagsDraft(newConversationTagsInput)
  }, [
    chatSettings,
    newChatSystemPrompt,
    newConversationFolder,
    newConversationTagsInput,
  ])

  return {
    chatSettingsDraft,
    conversationFolderDraft,
    conversationTagsDraft,
    pendingConversation,
    settingsDraft,
    setChatSettingsDraft,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setPendingConversation,
    setSettingsDraft,
    handleSaveSettings,
    resetForNewChatSettings,
    resetPendingConversation,
    resetSettingsDraft,
    syncSettingsDraft,
  }
}

function sanitizeConversationFolder(value: string) {
  return value.trim()
}

function parseConversationTags(value: string) {
  const seen = new Set<string>()
  const tags: string[] = []

  for (const item of value.split(',')) {
    const tag = item.trim()
    const normalizedTag = tag.toLowerCase()
    if (!tag || seen.has(normalizedTag)) {
      continue
    }

    seen.add(normalizedTag)
    tags.push(tag)
  }

  return tags
}

function buildConversationMetadataUpdate(
  folder: string,
  tags: string[],
  currentConversation: Conversation | null,
) {
  if (!currentConversation) {
    return {}
  }

  const folderChanged = folder !== currentConversation.folder
  const tagsChanged =
    tags.length !== currentConversation.tags.length ||
    tags.some((tag, index) => tag !== currentConversation.tags[index])

  return {
    ...(folderChanged ? { folder } : {}),
    ...(tagsChanged ? { tags } : {}),
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
