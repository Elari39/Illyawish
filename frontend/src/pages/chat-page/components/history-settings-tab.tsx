import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'
import { SIDEBAR_UNFILED_FOLDER_KEY } from '../utils'

interface HistorySettingsTabProps {
  showArchived: boolean
  availableFolders: string[]
  availableTags: string[]
  selectedFolder: string | null
  selectedTags: string[]
  selectionMode: boolean
  selectedConversationIds: Conversation['id'][]
  onToggleArchived: (value: boolean) => void
  onSelectFolder: (value: string | null) => void
  onToggleTag: (value: string) => void
  onSetSelectionMode: (value: boolean) => void
  onBulkMoveToFolder: () => void
  onBulkAddTags: () => void
  onBulkRemoveTags: () => void
}

export function HistorySettingsTab({
  showArchived,
  availableFolders,
  availableTags,
  selectedFolder,
  selectedTags,
  selectionMode,
  selectedConversationIds,
  onToggleArchived,
  onSelectFolder,
  onToggleTag,
  onSetSelectionMode,
  onBulkMoveToFolder,
  onBulkAddTags,
  onBulkRemoveTags,
}: HistorySettingsTabProps) {
  const { t } = useI18n()

  return (
    <div className="mt-6 grid gap-5">
      <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t('settings.historyViewSection')}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            {t('settings.historyViewHelp')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="px-3 py-2"
            onClick={() => onToggleArchived(false)}
            variant={showArchived ? 'secondary' : 'primary'}
          >
            {t('sidebar.active')}
          </Button>
          <Button
            className="px-3 py-2"
            onClick={() => onToggleArchived(true)}
            variant={showArchived ? 'primary' : 'secondary'}
          >
            {t('sidebar.archived')}
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t('settings.historyFiltersSection')}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            {t('settings.historyFiltersHelp')}
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('sidebar.foldersTitle')}
          </span>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={selectedFolder == null}
              label={t('sidebar.allFolders')}
              onClick={() => onSelectFolder(null)}
            />
            <FilterChip
              active={selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY}
              label={t('sidebar.unfiled')}
              onClick={() => onSelectFolder(SIDEBAR_UNFILED_FOLDER_KEY)}
            />
            {availableFolders.map((folder) => (
              <FilterChip
                key={folder}
                active={selectedFolder === folder}
                label={folder}
                onClick={() => onSelectFolder(folder)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('sidebar.tagsTitle')}
          </span>
          {availableTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const active = selectedTags.some((value) => value.toLowerCase() === tag.toLowerCase())
                return (
                  <FilterChip
                    key={tag}
                    active={active}
                    label={tag}
                    onClick={() => onToggleTag(tag)}
                  />
                )
              })}
            </div>
          ) : (
            <p className="text-sm leading-6 text-[var(--muted-foreground)]">
              {t('settings.historyNoTags')}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {t('settings.bulkManageSection')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              {selectionMode
                ? t('sidebar.selectedCount', { count: selectedConversationIds.length })
                : t('settings.bulkManageHelp')}
            </p>
          </div>
          <Button
            className="px-3 py-2"
            onClick={() => onSetSelectionMode(!selectionMode)}
            variant={selectionMode ? 'primary' : 'secondary'}
          >
            {selectionMode ? t('sidebar.selectionDone') : t('sidebar.selectionMode')}
          </Button>
        </div>

        {selectionMode ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={selectedConversationIds.length === 0}
              onClick={onBulkMoveToFolder}
              variant="secondary"
            >
              {t('sidebar.moveSelected')}
            </Button>
            <Button
              disabled={selectedConversationIds.length === 0}
              onClick={onBulkAddTags}
              variant="secondary"
            >
              {t('sidebar.addTagsSelected')}
            </Button>
            <Button
              disabled={selectedConversationIds.length === 0}
              onClick={onBulkRemoveTags}
              variant="secondary"
            >
              {t('sidebar.removeTagsSelected')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-[var(--brand)] text-white'
          : 'bg-[var(--surface-strong)] text-[var(--foreground)] hover:bg-[var(--hover-bg)]',
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}
