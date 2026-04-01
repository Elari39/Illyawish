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
      knowledgeSpaceIdsDraft,
      currentConversation,
      false,
    )
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
        setKnowledgeSpaceIdsDraft(knowledgeSpaceIdsDraft)
        onSaved()
        return
      }

      const updatedConversation = await chatApi.updateConversation(
        activeConversationId,
        {
          ...metadataUpdate,
          settings: {
            systemPrompt: settingsDraft.systemPrompt,
            providerPresetId: settingsDraft.providerPresetId ?? null,
            model: settingsDraft.model,
            temperature: settingsDraft.temperature,
            maxTokens: settingsDraft.maxTokens,
            contextWindowTurns: settingsDraft.contextWindowTurns,
          },
        },
      )
      syncConversationIntoList(updatedConversation)
      setPendingConversation(updatedConversation)
      setSettingsDraft(updatedConversation.settings)
      setConversationFolderDraft(updatedConversation.folder)
      setConversationTagsDraft(updatedConversation.tags.join(', '))
      setKnowledgeSpaceIdsDraft(updatedConversation.knowledgeSpaceIds ?? [])
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
          setSettingsDraft(previousConversation.settings)
          setConversationFolderDraft(previousConversation.folder)
          setConversationTagsDraft(previousConversation.tags.join(', '))
          setKnowledgeSpaceIdsDraft(previousConversation.knowledgeSpaceIds ?? [])
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
      setKnowledgeSpaceIdsDraft(currentConversation.knowledgeSpaceIds ?? [])
      return
    }

    setSettingsDraft(
      buildDraftConversationSettings(chatSettings, newChatSystemPrompt),
    )
    setConversationFolderDraft(newConversationFolder)
    setConversationTagsDraft(newConversationTagsInput)
    setKnowledgeSpaceIdsDraft([])
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

  const applyChatSettings = useCallback((nextChatSettings: ChatSettings) => {
    setChatSettings(nextChatSettings)
    setChatSettingsDraft(nextChatSettings)

    if (!currentConversation && !activeConversationId) {
      setSettingsDraft(
        buildDraftConversationSettings(nextChatSettings, newChatSystemPrompt),
      )
    }
  }, [activeConversationId, currentConversation, newChatSystemPrompt])

  const resetForNewChatSettings = useCallback(() => {
    setPendingConversation(null)
    setSettingsDraft(
      buildDraftConversationSettings(chatSettings, newChatSystemPrompt),
    )
    setConversationFolderDraft(newConversationFolder)
    setConversationTagsDraft(newConversationTagsInput)
    setKnowledgeSpaceIdsDraft([])
    setPendingKnowledgeSpaceIds([])
  }, [
    chatSettings,
    newChatSystemPrompt,
    newConversationFolder,
    newConversationTagsInput,
  ])

  const toggleKnowledgeSpace = useCallback(async (spaceId: number) => {
    setChatError(null)

    const previousIds = currentConversation?.knowledgeSpaceIds ?? knowledgeSpaceIdsDraft
    const nextIds = previousIds.includes(spaceId)
      ? previousIds.filter((id) => id !== spaceId)
      : [...previousIds, spaceId]

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
      setKnowledgeSpaceIdsDraft(updatedConversation.knowledgeSpaceIds ?? [])
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
  knowledgeSpaceIds: number[],
  currentConversation: Conversation | null,
  includeKnowledge = true,
) {
  if (!currentConversation) {
    return {}
  }

  const folderChanged = folder !== currentConversation.folder
  const tagsChanged =
    tags.length !== currentConversation.tags.length ||
    tags.some((tag, index) => tag !== currentConversation.tags[index])
  const knowledgeChanged =
    knowledgeSpaceIds.length !== (currentConversation.knowledgeSpaceIds ?? []).length ||
    knowledgeSpaceIds.some((id, index) => id !== (currentConversation.knowledgeSpaceIds ?? [])[index])

  return {
    ...(folderChanged ? { folder } : {}),
    ...(tagsChanged ? { tags } : {}),
    ...(includeKnowledge && knowledgeChanged ? { knowledgeSpaceIds } : {}),
  }
}

function buildDraftConversationSettings(
  chatSettings: ChatSettings,
  systemPrompt: string,
): ConversationSettings {
  return {
    systemPrompt,
    providerPresetId: chatSettings.providerPresetId ?? null,
    model: chatSettings.model,
    temperature: chatSettings.temperature,
    maxTokens: chatSettings.maxTokens,
    contextWindowTurns: chatSettings.contextWindowTurns,
  }
}
