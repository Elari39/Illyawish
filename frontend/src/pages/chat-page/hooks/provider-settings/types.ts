import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { I18nContextValue } from '../../../../i18n/context'
import type { ProviderState } from '../../../../types/chat'
import type { ProviderEditorMode, ProviderFormState } from '../../types'
import { resolveProviderEditorState } from '../../utils'

export interface ProviderSettingsMutationOptions {
  providerState: ProviderState | null
  providerForm: ProviderFormState
  editingProviderId: number | null
  providerStateRef: MutableRefObject<ProviderState | null>
  providerEditorModeRef: MutableRefObject<ProviderEditorMode>
  setProviderState: Dispatch<SetStateAction<ProviderState | null>>
  setProviderForm: Dispatch<SetStateAction<ProviderFormState>>
  setEditingProviderId: Dispatch<SetStateAction<number | null>>
  setProviderEditorMode: Dispatch<SetStateAction<ProviderEditorMode>>
  setIsSavingProvider: Dispatch<SetStateAction<boolean>>
  setIsTestingProvider: Dispatch<SetStateAction<boolean>>
  setChatError: (value: string | null) => void
  showToast: (message: string, variant?: 'success' | 'error' | 'info') => void
  t: I18nContextValue['t']
}

export type ProviderEditorTarget = ReturnType<typeof resolveProviderEditorState>

export type ProviderStateApplyOptions = Pick<
  ProviderSettingsMutationOptions,
  | 'providerStateRef'
  | 'providerEditorModeRef'
  | 'setProviderState'
  | 'setProviderForm'
  | 'setEditingProviderId'
  | 'setProviderEditorMode'
>

export interface ProviderEditorActionOptions
  extends Pick<
    ProviderSettingsMutationOptions,
    | 'providerState'
    | 'providerStateRef'
    | 'providerEditorModeRef'
    | 'setProviderForm'
    | 'setEditingProviderId'
    | 'setProviderEditorMode'
  > {
  applyResolvedProviderEditor: (nextProviderEditor: ProviderEditorTarget) => void
}

export interface ProviderSaveTestActionOptions
  extends Pick<
    ProviderSettingsMutationOptions,
    | 'providerState'
    | 'providerForm'
    | 'providerEditorModeRef'
    | 'setProviderForm'
    | 'setIsSavingProvider'
    | 'setIsTestingProvider'
    | 'setChatError'
    | 'showToast'
    | 't'
  > {
  applyProviderState: (
    nextState: ProviderState,
    preferredMode?: ProviderEditorMode,
  ) => void
}

export interface ProviderMutationValidation {
  defaultModel: string
  normalizedModels: string[]
}
