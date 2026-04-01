import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { providerApi } from '../../../lib/api'
import type { ProviderPreset, ProviderState } from '../../../types/chat'
import type { ProviderEditorMode, ProviderFormState } from '../types'
import {
  canReuseActivePresetAPIKey,
  createProviderForm,
  defaultBaseURLForProviderFormat,
  hasProviderFormErrors,
  normalizeProviderFormat,
  normalizeModelEntries,
  resolveProviderEditorState,
  validateProviderForm,
} from '../utils'

interface UseProviderSettingsOptions {
  isSettingsOpen: boolean
  setChatError: (value: string | null) => void
  showToast: (message: string, variant?: 'success' | 'error' | 'info') => void
}

export function useProviderSettings({
  isSettingsOpen,
  setChatError,
  showToast,
}: UseProviderSettingsOptions) {
  const { t } = useI18n()
  const [providerState, setProviderState] = useState<ProviderState | null>(null)
  const [providerForm, setProviderForm] = useState<ProviderFormState>(
    createProviderForm(),
  )
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null)
  const [providerEditorMode, setProviderEditorMode] = useState<ProviderEditorMode>({
    type: 'auto',
  })
  const [isLoadingProviders, setIsLoadingProviders] = useState(false)
  const [isSavingProvider, setIsSavingProvider] = useState(false)
  const [isTestingProvider, setIsTestingProvider] = useState(false)
  const providerStateRef = useRef<ProviderState | null>(null)
  const setChatErrorRef = useRef(setChatError)
  const tRef = useRef(t)
  const providerEditorModeRef = useRef<ProviderEditorMode>({
    type: 'auto',
  })

  useEffect(() => {
    providerStateRef.current = providerState
  }, [providerState])

  useEffect(() => {
    setChatErrorRef.current = setChatError
  }, [setChatError])

  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    providerEditorModeRef.current = providerEditorMode
  }, [providerEditorMode])

  const applyResolvedProviderEditor = useCallback((
    nextProviderEditor: ReturnType<typeof resolveProviderEditorState>,
  ) => {
    providerEditorModeRef.current = nextProviderEditor.providerEditorMode
    setProviderEditorMode(nextProviderEditor.providerEditorMode)
    setEditingProviderId(nextProviderEditor.editingProviderId)
    setProviderForm(nextProviderEditor.providerForm)
  }, [])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    const nextProviderEditorMode: ProviderEditorMode = { type: 'auto' }
    providerEditorModeRef.current = nextProviderEditorMode
    setProviderEditorMode(nextProviderEditorMode)

    if (providerStateRef.current) {
      applyResolvedProviderEditor(
        resolveProviderEditorState(
          providerStateRef.current,
          nextProviderEditorMode,
        ),
      )
    }
  }, [applyResolvedProviderEditor, isSettingsOpen])

  useEffect(() => {
    let cancelled = false

    async function fetchProviderState() {
      try {
        setIsLoadingProviders(true)
        const nextState = await providerApi.list()
        if (cancelled) {
          return
        }
        providerStateRef.current = nextState
        setProviderState(nextState)
        applyResolvedProviderEditor(
          resolveProviderEditorState(nextState, providerEditorModeRef.current),
        )
      } catch (error) {
        if (cancelled) {
          return
        }
        setChatErrorRef.current(
          error instanceof Error
            ? error.message
            : tRef.current('error.loadProviders'),
        )
      } finally {
        if (!cancelled) {
          setIsLoadingProviders(false)
        }
      }
    }

    void fetchProviderState()

    return () => {
      cancelled = true
    }
  }, [applyResolvedProviderEditor, isSettingsOpen])

  function applyProviderState(
    nextState: ProviderState,
    preferredMode: ProviderEditorMode = providerEditorModeRef.current,
  ) {
    providerStateRef.current = nextState
    setProviderState(nextState)
    applyResolvedProviderEditor(
      resolveProviderEditorState(nextState, preferredMode),
    )
  }

  function resolveSubmittedAPIKey() {
    const trimmedAPIKey = providerForm.apiKey.trim()

    if (!trimmedAPIKey) {
      return undefined
    }

    return trimmedAPIKey
  }

  function canReuseActiveAPIKeyForNewPreset() {
    return canReuseActivePresetAPIKey(providerStateRef.current)
  }

  function handleStartNewProvider() {
    const nextProviderEditorMode: ProviderEditorMode = { type: 'new' }
    providerEditorModeRef.current = nextProviderEditorMode
    setProviderEditorMode(nextProviderEditorMode)
    setEditingProviderId(null)
    setProviderForm(createProviderForm(providerState?.fallback))
  }

  function handleEditProvider(preset: ProviderPreset) {
    const nextProviderEditorMode: ProviderEditorMode = {
      type: 'edit',
      providerId: preset.id,
    }
    providerEditorModeRef.current = nextProviderEditorMode
    setProviderEditorMode(nextProviderEditorMode)
    setEditingProviderId(preset.id)
    setProviderForm(createProviderForm(providerState?.fallback, preset))
  }

  function handleProviderFieldChange(
    field: 'format' | 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) {
    if (field === 'format') {
      setProviderForm((previous) => {
        const nextFormat = normalizeProviderFormat(value)
        const previousFormat = normalizeProviderFormat(previous.format)
        const previousDefaultBaseURL = defaultBaseURLForProviderFormat(previousFormat)
        const shouldResetBaseURL =
          !previous.baseURL.trim() || previous.baseURL === previousDefaultBaseURL

        return {
          ...previous,
          format: nextFormat,
          baseURL: shouldResetBaseURL
            ? defaultBaseURLForProviderFormat(nextFormat)
            : previous.baseURL,
          errors: {
            ...previous.errors,
            format: undefined,
            baseURL: undefined,
          },
        }
      })
      return
    }

    setProviderForm((previous) => ({
      ...previous,
      [field]: value,
      errors: {
        ...previous.errors,
        [field]: undefined,
      },
    }))
  }

  function handleProviderModelsChange(
    value: Pick<ProviderFormState, 'models' | 'defaultModel'>,
  ) {
    setProviderForm((previous) => ({
      ...previous,
      ...value,
      errors: {
        ...previous.errors,
        models: undefined,
        modelItems: [],
        defaultModel: undefined,
      },
    }))
  }

  async function handleSaveProvider() {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const currentProviderEditorMode = providerEditorModeRef.current
      const canReuseActiveAPIKey =
        currentProviderEditorMode.type !== 'edit' &&
        canReuseActiveAPIKeyForNewPreset()
      const validation = validateProviderForm(providerForm, {
        requireAPIKey:
          currentProviderEditorMode.type !== 'edit' &&
          !canReuseActiveAPIKey,
        t,
      })
      if (hasProviderFormErrors(validation.errors)) {
        setProviderForm((previous) => ({
          ...previous,
          errors: validation.errors,
        }))
        return
      }

      const models = normalizeModelEntries(providerForm.models)
      const nextAPIKey = resolveSubmittedAPIKey()
      const shouldReuseActiveAPIKey =
        canReuseActiveAPIKey && !nextAPIKey
      const nextState = currentProviderEditorMode.type === 'edit'
        ? await providerApi.update(currentProviderEditorMode.providerId, {
            format: providerForm.format,
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            models,
            defaultModel: validation.defaultModel,
            ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
          })
        : await providerApi.create({
            format: providerForm.format,
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
            ...(shouldReuseActiveAPIKey ? { reuseActiveApiKey: true } : {}),
            models,
            defaultModel: validation.defaultModel,
          })

      const nextProviderEditorMode =
        currentProviderEditorMode.type === 'edit'
          ? currentProviderEditorMode
          : nextState.activePresetId != null
            ? {
                type: 'edit' as const,
                providerId: nextState.activePresetId,
              }
            : { type: 'auto' as const }

      applyProviderState(nextState, nextProviderEditorMode)
      showToast(
        currentProviderEditorMode.type === 'edit'
          ? t('settings.savePreset')
          : t('settings.createPreset'),
        'success',
      )
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.saveProviderSettings'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function handleTestProvider() {
    setIsTestingProvider(true)
    setChatError(null)

    try {
      const currentProviderEditorMode = providerEditorModeRef.current
      const canReuseActiveAPIKey =
        currentProviderEditorMode.type !== 'edit' &&
        canReuseActiveAPIKeyForNewPreset()
      const validation = validateProviderForm(providerForm, {
        requireAPIKey:
          currentProviderEditorMode.type !== 'edit' &&
          !canReuseActiveAPIKey,
        t,
      })
      if (hasProviderFormErrors(validation.errors)) {
        setProviderForm((previous) => ({
          ...previous,
          errors: validation.errors,
        }))
        return
      }

      const nextAPIKey = resolveSubmittedAPIKey()
      const shouldReuseActiveAPIKey =
        canReuseActiveAPIKey && !nextAPIKey
      const result = await providerApi.test({
        ...(currentProviderEditorMode.type === 'edit'
          ? { providerId: currentProviderEditorMode.providerId }
          : {}),
        format: providerForm.format,
        baseURL: providerForm.baseURL,
        ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
        ...(shouldReuseActiveAPIKey ? { reuseActiveApiKey: true } : {}),
        defaultModel: validation.defaultModel,
      })
      showToast(result.message, 'success')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('error.saveProviderSettings')
      setChatError(message)
    } finally {
      setIsTestingProvider(false)
    }
  }

  async function handleActivateProvider(providerId: number) {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = await providerApi.activate(providerId)
      applyProviderState(nextState, {
        type: 'edit',
        providerId,
      })
      showToast(t('settings.setActive'), 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.activateProviderPreset'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function handleDeleteProvider(preset: ProviderPreset) {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = await providerApi.delete(preset.id)
      applyProviderState(
        nextState,
        editingProviderId === preset.id
          ? { type: 'auto' }
          : providerEditorModeRef.current,
      )
      showToast(t('common.delete'), 'success')
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : t('error.deleteProviderPreset'),
      )
    } finally {
      setIsSavingProvider(false)
    }
  }

  return {
    providerState,
    providerForm,
    editingProviderId,
    isLoadingProviders,
    isSavingProvider,
    isTestingProvider,
    handleProviderFieldChange,
    handleProviderModelsChange,
    handleActivateProvider,
    handleDeleteProvider,
    handleEditProvider,
    handleSaveProvider,
    handleStartNewProvider,
    handleTestProvider,
  }
}
