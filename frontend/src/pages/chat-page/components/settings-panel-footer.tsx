import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { SettingsPanelProps } from './settings-panel-types'

type SettingsPanelFooterProps = Pick<
  SettingsPanelProps,
  | 'activeTab'
  | 'editingProviderId'
  | 'isLoadingProviders'
  | 'isSaving'
  | 'isSavingProvider'
  | 'isTestingProvider'
  | 'onClose'
  | 'onReset'
  | 'onResetProvider'
  | 'onSave'
  | 'onSaveProvider'
  | 'onTestProvider'
>

export function SettingsPanelFooter({
  activeTab,
  editingProviderId,
  isLoadingProviders,
  isSaving,
  isSavingProvider,
  isTestingProvider,
  onClose,
  onReset,
  onResetProvider,
  onSave,
  onSaveProvider,
  onTestProvider,
}: SettingsPanelFooterProps) {
  const { t } = useI18n()

  return (
    <div
      className="flex shrink-0 flex-wrap justify-end gap-3 max-sm:flex-col"
      data-testid="settings-panel-footer"
    >
      {activeTab === 'chat' ? (
        <>
          <Button className="max-sm:w-full" onClick={onReset} variant="ghost">
            {t('common.reset')}
          </Button>
          <Button className="max-sm:w-full" onClick={onClose} variant="secondary">
            {t('common.close')}
          </Button>
          <Button className="max-sm:w-full" disabled={isSaving} onClick={onSave}>
            {isSaving ? t('common.saving') : t('settings.saveSettings')}
          </Button>
        </>
      ) : activeTab === 'provider' ? (
        <>
          <Button className="max-sm:w-full" onClick={onResetProvider} variant="ghost">
            {editingProviderId
              ? t('settings.newPreset')
              : t('settings.resetForm')}
          </Button>
          <Button
            className="max-sm:w-full"
            disabled={isLoadingProviders || isSavingProvider || isTestingProvider}
            onClick={onTestProvider}
            variant="secondary"
          >
            {isTestingProvider
              ? t('settings.testingConnection')
              : t('settings.testConnection')}
          </Button>
          <Button className="max-sm:w-full" onClick={onClose} variant="secondary">
            {t('common.close')}
          </Button>
          <Button
            className="max-sm:w-full"
            disabled={isLoadingProviders || isSavingProvider}
            onClick={onSaveProvider}
          >
            {isSavingProvider
              ? t('common.saving')
              : editingProviderId
                ? t('settings.savePreset')
                : t('settings.createPreset')}
          </Button>
        </>
      ) : (
        <Button className="max-sm:w-full" onClick={onClose} variant="secondary">
          {t('common.close')}
        </Button>
      )}
    </div>
  )
}
