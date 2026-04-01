import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import { chatApi } from '../../../lib/api'
import {
  parseOptionalNonNegativeInteger,
  parseOptionalTemperature,
  toChatNumericInputDrafts,
  type ChatNumericInputDrafts,
} from '../../../lib/numeric-input'
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
  const [chatSettingsDraft, setChatSettingsDraftStateInternal] = useState<ChatSettings>(
    defaultChatSettings,
  )
  const [chatNumericInputDrafts, setChatNumericInputDrafts] = useState<ChatNumericInputDrafts>(
    toChatNumericInputDrafts(defaultChatSettings),
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
  const activeConversationIdRef = useRef(activeConversationId)
  const setChatErrorRef = useRef(setChatError)
  const tRef = useRef(t)
  const knowledgeSpaceIdsDraftRef = useRef<number[]>([])
  const knowledgeSpaceRequestVersionsRef = useRef<Record<number, number>>({})
  const pendingKnowledgeSpaceCountsRef = useRef<Record<number, number>>({})

  const setKnowledgeSpaceIdsDraftState = useCallback((value: SetStateAction<number[]>) => {
    setKnowledgeSpaceIdsDraft((previous) => {
      const nextValue = typeof value === 'function' ? value(previous) : value
      knowledgeSpaceIdsDraftRef.current = nextValue
      return nextValue
    })
  }, [])

  const replaceChatNumericInputDrafts = useCallback((nextChatSettings: ChatSettings) => {
    setChatNumericInputDrafts(toChatNumericInputDrafts(nextChatSettings))
  }, [])

  const replaceChatSettingsDraft = useCallback((nextChatSettings: ChatSettings) => {
    setChatSettingsDraftStateInternal(nextChatSettings)
    replaceChatNumericInputDrafts(nextChatSettings)
  }, [replaceChatNumericInputDrafts])

  const setChatSettingsDraft = useCallback((value: SetStateAction<ChatSettings>) => {
    setChatSettingsDraftStateInternal((previous) => {
      const nextValue = typeof value === 'function' ? value(previous) : value
      setChatNumericInputDrafts((currentDrafts) =>
        syncChatNumericInputDrafts(currentDrafts, previous, nextValue),
      )
      return nextValue
    })
  }, [])

  const setChatNumericInputDraft = useCallback((
    field: keyof ChatNumericInputDrafts,
    value: string,
  ) => {
    setChatNumericInputDrafts((previous) => ({
      ...previous,
      [field]: value,
    }))
  }, [])

  const syncPendingKnowledgeSpaceIds = useCallback(() => {
    setPendingKnowledgeSpaceIds(
      Object.entries(pendingKnowledgeSpaceCountsRef.current)
        .filter(([, count]) => count > 0)
        .map(([id]) => Number(id))
        .sort((left, right) => left - right),
    )
  }, [])

  const updatePendingKnowledgeSpace = useCallback((spaceId: number, delta: number) => {
    const nextCount = (pendingKnowledgeSpaceCountsRef.current[spaceId] ?? 0) + delta
    if (nextCount <= 0) {
      delete pendingKnowledgeSpaceCountsRef.current[spaceId]
    } else {
      pendingKnowledgeSpaceCountsRef.current[spaceId] = nextCount
    }
    syncPendingKnowledgeSpaceIds()
  }, [syncPendingKnowledgeSpaceIds])

  const applyDraftSnapshot = useCallback((snapshot: ChatSettingsDraftSnapshot) => {
    setSettingsDraft(snapshot.settingsDraft)
    setConversationFolderDraft(snapshot.conversationFolderDraft)
    setConversationTagsDraft(snapshot.conversationTagsDraft)
    setKnowledgeSpaceIdsDraftState(snapshot.knowledgeSpaceIdsDraft)
  }, [setKnowledgeSpaceIdsDraftState])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
    knowledgeSpaceRequestVersionsRef.current = {}
    pendingKnowledgeSpaceCountsRef.current = {}
    setPendingKnowledgeSpaceIds([])
  }, [activeConversationId])

  useEffect(() => {
    setChatErrorRef.current = setChatError
    tRef.current = t
  }, [setChatError, t])

  useEffect(() => {
    let cancelled = false

    async function loadChatSettings() {
      try {
        const nextChatSettings = await chatApi.getChatSettings()
        if (cancelled) {
          return
        }

        setChatSettings(nextChatSettings)
        replaceChatSettingsDraft(nextChatSettings)
      } catch (error) {
        if (cancelled) {
          return
        }
        setChatErrorRef.current(
          error instanceof Error ? error.message : tRef.current('error.loadChatSettings'),
        )
      }
    }

    void loadChatSettings()

    return () => {
      cancelled = true
    }
  }, [replaceChatSettingsDraft])

  const handleSaveSettings = useCallback(async (onSaved: () => void) => {
    setChatError(null)
    const parsedChatSettingsDraft = parseChatNumericSettingsDraft(
      chatSettingsDraft,
      chatNumericInputDrafts,
    )
    if (!parsedChatSettingsDraft.isValid) {
      setChatError(t('settings.validation.numericFields'))
      return
    }

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
        await chatApi.updateChatSettings(parsedChatSettingsDraft.value)
      globalSettingsSaved = true
      setChatSettings(updatedChatSettings)
      replaceChatSettingsDraft(updatedChatSettings)

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
          replaceChatSettingsDraft(rolledBackChatSettings)
        } catch {
          setChatSettings(previousChatSettings)
          replaceChatSettingsDraft(previousChatSettings)
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
    chatNumericInputDrafts,
    conversationFolderDraft,
    conversationTagsDraft,
    knowledgeSpaceIdsDraft,
    currentConversation,
    settingsDraft,
    applyDraftSnapshot,
    replaceChatSettingsDraft,
    setChatError,
    syncConversationIntoList,
    t,
  ])

  const syncSettingsDraft = useCallback(() => {
    replaceChatSettingsDraft(chatSettings)

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
    replaceChatSettingsDraft,
  ])

  const resetSettingsDraft = useCallback(() => {
    syncSettingsDraft()
  }, [syncSettingsDraft])

  const resetPendingConversation = useCallback(() => {
    setPendingConversation(null)
  }, [])

  const applyChatSettings = useCallback((nextChatSettings: ChatSettings) => {
    setChatSettings(nextChatSettings)
    replaceChatSettingsDraft(nextChatSettings)

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
    replaceChatSettingsDraft,
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
    knowledgeSpaceRequestVersionsRef.current = {}
    pendingKnowledgeSpaceCountsRef.current = {}
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

    const previousIds = knowledgeSpaceIdsDraftRef.current
    const nextIds = resolveKnowledgeSpaceToggle(previousIds, spaceId)
    const requestVersion = (knowledgeSpaceRequestVersionsRef.current[spaceId] ?? 0) + 1

    setKnowledgeSpaceIdsDraftState(nextIds)

    if (!activeConversationId || !currentConversation) {
      return
    }

    const conversationId = activeConversationId
    knowledgeSpaceRequestVersionsRef.current[spaceId] = requestVersion
    updatePendingKnowledgeSpace(spaceId, 1)

    try {
      const updatedConversation = await chatApi.updateConversation(conversationId, {
        knowledgeSpaceIds: nextIds,
      })
      if (
        activeConversationIdRef.current === conversationId &&
        knowledgeSpaceRequestVersionsRef.current[spaceId] === requestVersion &&
        haveSameKnowledgeSpaceIds(
          updatedConversation.knowledgeSpaceIds ?? [],
          knowledgeSpaceIdsDraftRef.current,
        )
      ) {
        syncConversationIntoList(updatedConversation)
        setPendingConversation(updatedConversation)
        setKnowledgeSpaceIdsDraftState(
          buildConversationDraftSnapshot(updatedConversation).knowledgeSpaceIdsDraft,
        )
      }
    } catch (error) {
      if (
        activeConversationIdRef.current === conversationId &&
        knowledgeSpaceRequestVersionsRef.current[spaceId] === requestVersion
      ) {
        setKnowledgeSpaceIdsDraftState((currentIds) =>
          rollbackKnowledgeSpaceToggle(currentIds, previousIds, spaceId),
        )
        setChatError(
          error instanceof Error ? error.message : t('error.saveSettings'),
        )
      }
    } finally {
      if (activeConversationIdRef.current === conversationId) {
        updatePendingKnowledgeSpace(spaceId, -1)
      }
    }
  }, [
    activeConversationId,
    currentConversation,
    setChatError,
    setKnowledgeSpaceIdsDraftState,
    syncConversationIntoList,
    t,
    updatePendingKnowledgeSpace,
  ])

  return {
    chatSettingsDraft,
    chatNumericInputDrafts,
    conversationFolderDraft,
    conversationTagsDraft,
    knowledgeSpaceIdsDraft,
    pendingKnowledgeSpaceIds,
    pendingConversation,
    settingsDraft,
    setChatSettingsDraft,
    setChatNumericInputDraft,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setKnowledgeSpaceIdsDraft: setKnowledgeSpaceIdsDraftState,
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

function haveSameKnowledgeSpaceIds(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false
  }
  return left.every((value, index) => value === right[index])
}

function rollbackKnowledgeSpaceToggle(
  currentIds: number[],
  previousIds: number[],
  spaceId: number,
) {
  if (!previousIds.includes(spaceId)) {
    return currentIds.filter((id) => id !== spaceId)
  }
  if (currentIds.includes(spaceId)) {
    return currentIds
  }

  let insertAt = 0
  for (const previousId of previousIds) {
    if (previousId === spaceId) {
      break
    }
    const currentIndex = currentIds.indexOf(previousId)
    if (currentIndex >= 0) {
      insertAt = currentIndex + 1
    }
  }

  return [
    ...currentIds.slice(0, insertAt),
    spaceId,
    ...currentIds.slice(insertAt),
  ]
}

function syncChatNumericInputDrafts(
  currentDrafts: ChatNumericInputDrafts,
  previousSettings: ChatSettings,
  nextSettings: ChatSettings,
): ChatNumericInputDrafts {
  return {
    temperature:
      previousSettings.temperature === nextSettings.temperature
        ? currentDrafts.temperature
        : nextSettings.temperature == null
          ? ''
          : String(nextSettings.temperature),
    maxTokens:
      previousSettings.maxTokens === nextSettings.maxTokens
        ? currentDrafts.maxTokens
        : nextSettings.maxTokens == null
          ? ''
          : String(nextSettings.maxTokens),
    contextWindowTurns:
      previousSettings.contextWindowTurns === nextSettings.contextWindowTurns
        ? currentDrafts.contextWindowTurns
        : nextSettings.contextWindowTurns == null
          ? ''
          : String(nextSettings.contextWindowTurns),
  }
}

function parseChatNumericSettingsDraft(
  chatSettingsDraft: ChatSettings,
  chatNumericInputDrafts: ChatNumericInputDrafts,
): {
  isValid: boolean
  value: ChatSettings
} {
  const parsedTemperature = parseOptionalTemperature(chatNumericInputDrafts.temperature)
  const parsedMaxTokens = parseOptionalNonNegativeInteger(chatNumericInputDrafts.maxTokens)
  const parsedContextWindowTurns = parseOptionalNonNegativeInteger(
    chatNumericInputDrafts.contextWindowTurns,
  )

  if (
    !parsedTemperature.isValid ||
    !parsedMaxTokens.isValid ||
    !parsedContextWindowTurns.isValid
  ) {
    return {
      isValid: false,
      value: chatSettingsDraft,
    }
  }

  return {
    isValid: true,
    value: {
      ...chatSettingsDraft,
      temperature: parsedTemperature.value,
      maxTokens: parsedMaxTokens.value,
      contextWindowTurns: parsedContextWindowTurns.value,
    },
  }
}
