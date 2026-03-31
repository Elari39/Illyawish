import type { TranslationKey } from '../../../i18n/messages'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { SettingsTab } from '../types'

interface SettingsPanelTabNavProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

const SETTINGS_TABS: Array<{ key: SettingsTab; labelKey: TranslationKey }> = [
  { key: 'chat', labelKey: 'settings.chatTab' },
  { key: 'history', labelKey: 'settings.historyTab' },
  { key: 'provider', labelKey: 'settings.providerTab' },
  { key: 'rag', labelKey: 'settings.ragTab' },
  { key: 'knowledge', labelKey: 'settings.knowledgeTab' },
  { key: 'workflow', labelKey: 'settings.workflowTab' },
  { key: 'security', labelKey: 'settings.securityTab' },
  { key: 'language', labelKey: 'settings.languageTab' },
  { key: 'transfer', labelKey: 'settings.transferTab' },
]

export function SettingsPanelTabNav({
  activeTab,
  onTabChange,
}: SettingsPanelTabNavProps) {
  const { t } = useI18n()

  return (
    <div
      className="mt-6 flex min-h-12 shrink-0 overflow-x-auto whitespace-nowrap rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] p-1"
      data-testid="settings-panel-tab-nav"
    >
      {SETTINGS_TABS.map((tab) => (
        <button
          key={tab.key}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4',
            activeTab === tab.key
              ? 'bg-[var(--surface-strong)] text-[var(--foreground)] shadow-sm'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
          )}
          onClick={() => onTabChange(tab.key)}
          type="button"
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  )
}
