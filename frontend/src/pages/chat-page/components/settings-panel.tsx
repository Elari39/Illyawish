import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
} from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { SettingsPanelBody } from './settings-panel-body'
import { SettingsPanelFooter } from './settings-panel-footer'
import { SettingsPanelTabNav } from './settings-panel-tab-nav'
import type { SettingsPanelProps } from './settings-panel-types'

export function SettingsPanel({
  activeTab,
  isOpen,
  onClose,
  ...props
}: SettingsPanelProps) {
  const { t } = useI18n()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  const wasOpenRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      closeButtonRef.current?.focus()
    }

    wasOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const descriptionText =
    activeTab === 'chat'
      ? t('settings.chatDescription')
      : activeTab === 'history'
        ? t('settings.historyDescription')
        : activeTab === 'provider'
          ? t('settings.providerDescription')
            : activeTab === 'rag'
              ? t('settings.ragDescription')
              : activeTab === 'knowledge'
                ? t('settings.knowledgeDescription')
                : activeTab === 'security'
                  ? t('settings.securityDescription')
                  : activeTab === 'language'
                    ? t('settings.languageDescription')
                    : t('settings.transferDescription')

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--overlay-scrim)] px-0 sm:px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-[100dvh] w-full flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow-lg)] sm:max-h-[88vh] sm:h-auto sm:max-w-5xl sm:rounded-[2rem] sm:p-6"
        data-testid="settings-panel"
        role="dialog"
      >
        <div className="shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-['Lora',serif] text-2xl font-bold tracking-tight" id={titleId}>
                {t('settings.title')}
              </h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]" id={descriptionId}>
                {descriptionText}
              </p>
            </div>
            <button
              aria-label={t('common.close')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)]"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <SettingsPanelTabNav
          activeTab={activeTab}
          onTabChange={props.onProviderTabChange}
        />

        <SettingsPanelBody
          activeTab={activeTab}
          {...props}
        />

        <div className="mt-6 shrink-0">
          <SettingsPanelFooter
            activeTab={activeTab}
            editingProviderId={props.editingProviderId}
            isLoadingProviders={props.isLoadingProviders}
            isSaving={props.isSaving}
            isSavingProvider={props.isSavingProvider}
            isTestingProvider={props.isTestingProvider}
            onClose={onClose}
            onReset={props.onReset}
            onResetProvider={props.onResetProvider}
            onSave={props.onSave}
            onSaveProvider={props.onSaveProvider}
            onTestProvider={props.onTestProvider}
          />
        </div>
      </div>
    </div>
  )
}
