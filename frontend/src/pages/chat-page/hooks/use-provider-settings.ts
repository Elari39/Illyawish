import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { providerApi } from '../../../lib/api'
import type { ProviderPreset, ProviderState } from '../../../types/chat'
import type { ProviderEditorMode, ProviderFormState } from '../types'
import {
  createProviderForm,
  hasProviderFormErrors,
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

  function findEditingPreset() {
    if (providerEditorMode.type !== 'edit') {
      return null
    }

    return (
      providerStateRef.current?.presets.find(
        (preset) => preset.id === providerEditorMode.providerId,
      ) ?? null
    )
  }

  function resolveSubmittedAPIKey(currentPreset: ProviderPreset | null) {
    const trimmedAPIKey = providerForm.apiKey.trim()

    if (!trimmedAPIKey) {
      return undefined
    }

    if (currentPreset && trimmedAPIKey === currentPreset.apiKey.trim()) {
      return undefined
    }

    return trimmedAPIKey
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
    field: 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) {
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
      const validation = validateProviderForm(providerForm, {
        requireAPIKey: providerEditorMode.type !== 'edit',
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
      const currentPreset = findEditingPreset()
      const nextAPIKey = resolveSubmittedAPIKey(currentPreset)
      const nextState = providerEditorMode.type === 'edit'
        ? await providerApi.update(providerEditorMode.providerId, {
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            models,
            defaultModel: validation.defaultModel,
            ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
          })
        : await providerApi.create({
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            apiKey: providerForm.apiKey.trim(),
            models,
            defaultModel: validation.defaultModel,
          })

      const nextProviderEditorMode =
        providerEditorMode.type === 'edit'
          ? providerEditorMode
          : nextState.activePresetId != null
            ? {
                type: 'edit' as const,
                providerId: nextState.activePresetId,
              }
            : { type: 'auto' as const }

      applyProviderState(nextState, nextProviderEditorMode)
      showToast(
        providerEditorMode.type === 'edit'
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
      const validation = validateProviderForm(providerForm, {
        requireAPIKey: providerEditorMode.type !== 'edit',
        t,
      })
      if (hasProviderFormErrors(validation.errors)) {
        setProviderForm((previous) => ({
          ...previous,
          errors: validation.errors,
        }))
        return
      }

      const currentPreset = findEditingPreset()
      const nextAPIKey = resolveSubmittedAPIKey(currentPreset)
      const result = await providerApi.test({
        ...(providerEditorMode.type === 'edit'
          ? { providerId: providerEditorMode.providerId }
          : {}),
        baseURL: providerForm.baseURL,
        ...(nextAPIKey ? { apiKey: nextAPIKey } : {}),
        defaultModel: validation.defaultModel,
      })
      showToast(result.message, 'success')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('error.saveProviderSettings')
      setChatError(message)
      showToast(message, 'error')
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
