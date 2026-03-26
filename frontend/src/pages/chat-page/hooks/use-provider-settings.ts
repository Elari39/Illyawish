import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { providerApi } from '../../../lib/api'
import type { ProviderPreset, ProviderState } from '../../../types/chat'
import type { ProviderFormState } from '../types'
import { createProviderForm, resolveProviderEditorState } from '../utils'

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
  const [isLoadingProviders, setIsLoadingProviders] = useState(false)
  const [isSavingProvider, setIsSavingProvider] = useState(false)
  const [isTestingProvider, setIsTestingProvider] = useState(false)
  const editingProviderIdRef = useRef<number | null>(null)

  useEffect(() => {
    editingProviderIdRef.current = editingProviderId
  }, [editingProviderId])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    let cancelled = false

    async function fetchProviderState() {
      try {
        setIsLoadingProviders(true)
        const nextState = await providerApi.list()
        if (cancelled) {
          return
        }
        const nextProviderEditor = resolveProviderEditorState(
          nextState,
          editingProviderIdRef.current,
        )
        setProviderState(nextState)
        setEditingProviderId(nextProviderEditor.editingProviderId)
        setProviderForm(nextProviderEditor.providerForm)
      } catch (error) {
        if (cancelled) {
          return
        }
        setChatError(
          error instanceof Error
            ? error.message
            : t('error.loadProviders'),
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
  }, [isSettingsOpen, setChatError, t])

  function applyProviderState(
    nextState: ProviderState,
    preferredPresetId: number | null = editingProviderIdRef.current,
  ) {
    const nextProviderEditor = resolveProviderEditorState(
      nextState,
      preferredPresetId,
    )
    setProviderState(nextState)
    setEditingProviderId(nextProviderEditor.editingProviderId)
    setProviderForm(nextProviderEditor.providerForm)
  }

  function handleStartNewProvider() {
    setEditingProviderId(null)
    setProviderForm(createProviderForm(providerState?.fallback))
  }

  function handleEditProvider(preset: ProviderPreset) {
    setEditingProviderId(preset.id)
    setProviderForm(createProviderForm(providerState?.fallback, preset))
  }

  async function handleSaveProvider() {
    setIsSavingProvider(true)
    setChatError(null)

    try {
      const nextState = editingProviderId
        ? await providerApi.update(editingProviderId, {
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            defaultModel: providerForm.defaultModel,
            ...(providerForm.apiKey.trim()
              ? { apiKey: providerForm.apiKey }
              : {}),
          })
        : await providerApi.create({
            name: providerForm.name,
            baseURL: providerForm.baseURL,
            apiKey: providerForm.apiKey,
            defaultModel: providerForm.defaultModel,
          })

      applyProviderState(nextState, editingProviderId ?? nextState.activePresetId)
      showToast(
        editingProviderId ? t('settings.savePreset') : t('settings.createPreset'),
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
      const result = await providerApi.test({
        ...(editingProviderId ? { providerId: editingProviderId } : {}),
        baseURL: providerForm.baseURL,
        ...(providerForm.apiKey.trim() ? { apiKey: providerForm.apiKey } : {}),
        defaultModel: providerForm.defaultModel,
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
      applyProviderState(nextState, providerId)
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
        editingProviderId === preset.id ? null : editingProviderId,
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
    setProviderForm,
    handleActivateProvider,
    handleDeleteProvider,
    handleEditProvider,
    handleSaveProvider,
    handleStartNewProvider,
    handleTestProvider,
  }
}
