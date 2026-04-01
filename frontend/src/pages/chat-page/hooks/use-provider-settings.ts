import { useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { providerApi } from '../../../lib/api'
import type { ProviderState } from '../../../types/chat'
import type { ProviderEditorMode, ProviderFormState } from '../types'
import { createProviderForm } from '../utils'
import { createProviderSettingsMutations } from './provider-settings/mutations'

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
  type MergeFormWithFetchedState = ReturnType<
    typeof createProviderSettingsMutations
  >['mergeFormWithFetchedState']
  const resetProviderEditorModeRef = useRef<() => void>(() => undefined)
  const mergeFormWithFetchedStateRef = useRef<MergeFormWithFetchedState>(
    () => undefined,
  )
  const mutations = useMemo(
    () =>
      createProviderSettingsMutations({
        providerState,
        providerForm,
        editingProviderId,
        providerStateRef,
        providerEditorModeRef,
        setProviderState,
        setProviderForm,
        setEditingProviderId,
        setProviderEditorMode,
        setIsSavingProvider,
        setIsTestingProvider,
        setChatError,
        showToast,
        t,
      }),
    [editingProviderId, providerForm, providerState, setChatError, showToast, t],
  )

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

  useEffect(() => {
    resetProviderEditorModeRef.current = mutations.resetProviderEditorMode
    mergeFormWithFetchedStateRef.current = mutations.mergeFormWithFetchedState
  }, [mutations])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    resetProviderEditorModeRef.current()
  }, [isSettingsOpen])

  useEffect(() => {
    let cancelled = false

    async function fetchProviderState() {
      try {
        setIsLoadingProviders(true)
        const previousState = providerStateRef.current
        const nextState = await providerApi.list()
        if (cancelled) {
          return
        }
        providerStateRef.current = nextState
        setProviderState(nextState)
        mergeFormWithFetchedStateRef.current(previousState, nextState)
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
  }, [isSettingsOpen, setProviderState])

  return {
    providerState,
    providerForm,
    editingProviderId,
    isLoadingProviders,
    isSavingProvider,
    isTestingProvider,
    handleProviderFieldChange: mutations.handleProviderFieldChange,
    handleProviderModelsChange: mutations.handleProviderModelsChange,
    handleActivateProvider: mutations.handleActivateProvider,
    handleDeleteProvider: mutations.handleDeleteProvider,
    handleEditProvider: mutations.handleEditProvider,
    handleSaveProvider: mutations.handleSaveProvider,
    handleStartNewProvider: mutations.handleStartNewProvider,
    handleTestProvider: mutations.handleTestProvider,
  }
}
