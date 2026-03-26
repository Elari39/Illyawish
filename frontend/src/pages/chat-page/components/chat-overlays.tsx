import { Suspense, lazy } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
  ProviderPreset,
  ProviderState,
} from '../../../types/chat'
import type {
  ConfirmationState,
  PromptState,
  ProviderFormState,
  SettingsTab,
  ToastState,
} from '../types'

const SettingsPanel = lazy(async () => import('./settings-panel').then((module) => ({
  default: module.SettingsPanel,
})))
const ConfirmationDialog = lazy(async () => import('./confirmation-dialog').then((module) => ({
  default: module.ConfirmationDialog,
})))
const PromptDialog = lazy(async () => import('./prompt-dialog').then((module) => ({
  default: module.PromptDialog,
})))
const ToastViewport = lazy(async () => import('./toast-viewport').then((module) => ({
  default: module.ToastViewport,
})))

interface ChatOverlaysProps {
  activeTab: SettingsTab
  confirmation: ConfirmationState | null
  editingProviderId: number | null
  chatSettings: ChatSettings
  isLoadingProviders: boolean
  isOpen: boolean
  isImporting: boolean
  isSaving: boolean
  isSavingProvider: boolean
  isTestingProvider: boolean
  messageCount: number
  promptState: PromptState | null
  providerForm: ProviderFormState
  providerState: ProviderState | null
  settings: ConversationSettings
  setChatSettings: Dispatch<SetStateAction<ChatSettings>>
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
  transferConversation: Conversation | null
  toasts: ToastState[]
  onActivateProvider: (providerId: number) => void
  onCloseConfirmation: () => void
  onClosePrompt: () => void
  onCloseSettings: () => void
  onDeleteProvider: (preset: ProviderPreset) => void
  onDismissToast: (toastId: number) => void
  onEditProvider: (preset: ProviderPreset) => void
  onExport: () => void
  onImport: (file: File) => void
  onProviderFieldChange: (
    field: 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) => void
  onProviderModelsChange: (value: { defaultModel: string; models: string[] }) => void
  onProviderTabChange: (tab: SettingsTab) => void
  onReset: () => void
  onResetProvider: () => void
  onSave: () => void
  onSaveProvider: () => void
  onStartNewProvider: () => void
  onTestProvider: () => void
}

export function ChatOverlays({
  activeTab,
  confirmation,
  editingProviderId,
  chatSettings,
  isLoadingProviders,
  isOpen,
  isImporting,
  isSaving,
  isSavingProvider,
  isTestingProvider,
  messageCount,
  promptState,
  providerForm,
  providerState,
  settings,
  setChatSettings,
  setSettings,
  transferConversation,
  toasts,
  onActivateProvider,
  onCloseConfirmation,
  onClosePrompt,
  onCloseSettings,
  onDeleteProvider,
  onDismissToast,
  onEditProvider,
  onExport,
  onImport,
  onProviderFieldChange,
  onProviderModelsChange,
  onProviderTabChange,
  onReset,
  onResetProvider,
  onSave,
  onSaveProvider,
  onStartNewProvider,
  onTestProvider,
}: ChatOverlaysProps) {
  return (
    <Suspense fallback={null}>
      <SettingsPanel
        activeTab={activeTab}
        chatSettings={chatSettings}
        editingProviderId={editingProviderId}
        isLoadingProviders={isLoadingProviders}
        isOpen={isOpen}
        isImporting={isImporting}
        isSavingProvider={isSavingProvider}
        isTestingProvider={isTestingProvider}
        isSaving={isSaving}
        messageCount={messageCount}
        onActivateProvider={(providerId) => void onActivateProvider(providerId)}
        onClose={onCloseSettings}
        onDeleteProvider={onDeleteProvider}
        onEditProvider={onEditProvider}
        onExport={onExport}
        onImport={onImport}
        onProviderFieldChange={onProviderFieldChange}
        onProviderModelsChange={onProviderModelsChange}
        onProviderTabChange={onProviderTabChange}
        onReset={onReset}
        onResetProvider={onResetProvider}
        onSave={() => void onSave()}
        onSaveProvider={() => void onSaveProvider()}
        onStartNewProvider={onStartNewProvider}
        onTestProvider={() => void onTestProvider()}
        providerForm={providerForm}
        providerState={providerState}
        settings={settings}
        setChatSettings={setChatSettings}
        setSettings={setSettings}
        transferConversation={transferConversation}
      />
      <ConfirmationDialog
        confirmation={confirmation}
        onClose={onCloseConfirmation}
      />
      <PromptDialog
        promptState={promptState}
        onClose={onClosePrompt}
      />
      <ToastViewport
        toasts={toasts}
        onDismiss={onDismissToast}
      />
    </Suspense>
  )
}
