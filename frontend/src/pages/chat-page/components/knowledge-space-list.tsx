import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { KnowledgeSpace } from '../../../types/chat'

interface KnowledgeSpaceListProps {
  knowledgeSpaces: KnowledgeSpace[]
  selectedKnowledgeSpaceIds: number[]
  pendingKnowledgeSpaceIds: number[]
  onToggleSpace: (space: KnowledgeSpace) => void | Promise<void>
  onEditSpace: (space: KnowledgeSpace) => void
  onDeleteSpace: (space: KnowledgeSpace) => void
}

export function KnowledgeSpaceList({
  knowledgeSpaces,
  selectedKnowledgeSpaceIds,
  pendingKnowledgeSpaceIds,
  onToggleSpace,
  onEditSpace,
  onDeleteSpace,
}: KnowledgeSpaceListProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {t('knowledge.spacesTitle')}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
          {t('knowledge.spacesDescription')}
        </p>
      </div>

      <div className="grid gap-3">
        {knowledgeSpaces.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">{t('knowledge.noSpaces')}</p>
        ) : (
          knowledgeSpaces.map((space) => {
            const selected = selectedKnowledgeSpaceIds.includes(space.id)
            const isPending = pendingKnowledgeSpaceIds.includes(space.id)
            const toggleLabel = selected
              ? t('knowledge.disableSpaceAction', { name: space.name })
              : t('knowledge.enableSpaceAction', { name: space.name })
            return (
              <div
                className={cn(
                  'rounded-xl border p-4 transition',
                  selected
                    ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 shadow-sm'
                    : 'border-[var(--line)] bg-[var(--surface-strong)]',
                  isPending && 'opacity-80',
                )}
                key={space.id}
              >
                <div
                  aria-label={toggleLabel}
                  aria-disabled={isPending}
                  className={cn(
                    'group flex cursor-pointer items-start justify-between gap-4 rounded-lg',
                    isPending && 'cursor-wait',
                  )}
                  onClick={() => {
                    if (!isPending) {
                      void onToggleSpace(space)
                    }
                  }}
                  role="button"
                  tabIndex={-1}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {space.name}
                      </span>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                          selected
                            ? 'bg-[var(--brand)]/15 text-[var(--brand)]'
                            : 'bg-[var(--hover-bg)] text-[var(--muted-foreground)]',
                        )}
                      >
                        {selected ? t('knowledge.spaceEnabled') : t('knowledge.spaceDisabled')}
                      </span>
                      {isPending ? (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {t('knowledge.spaceSaving')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                      {space.description || t('knowledge.noDescription')}
                    </p>
                  </div>

                  <button
                    aria-checked={selected}
                    aria-label={toggleLabel}
                    className={cn(
                      'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 disabled:cursor-not-allowed',
                      selected
                        ? 'border-[var(--brand)]/40 bg-[var(--brand)]'
                        : 'border-[var(--line)] bg-[var(--hover-bg)]',
                    )}
                    disabled={isPending}
                    onClick={(event) => {
                      event.stopPropagation()
                      void onToggleSpace(space)
                    }}
                    role="switch"
                    type="button"
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                        selected ? 'translate-x-6' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={(event) => {
                      event.stopPropagation()
                      onEditSpace(space)
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {t('knowledge.editSpace')}
                  </Button>
                  <Button
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteSpace(space)
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {t('knowledge.deleteSpace')}
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
