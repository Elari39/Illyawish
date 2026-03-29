import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { KnowledgeSpace } from '../../../types/chat'

interface KnowledgeSpaceListProps {
  knowledgeSpaces: KnowledgeSpace[]
  selectedKnowledgeSpaceIds: number[]
  setSelectedKnowledgeSpaceIds: React.Dispatch<React.SetStateAction<number[]>>
  onEditSpace: (space: KnowledgeSpace) => void
  onDeleteSpace: (space: KnowledgeSpace) => void
}

export function KnowledgeSpaceList({
  knowledgeSpaces,
  selectedKnowledgeSpaceIds,
  setSelectedKnowledgeSpaceIds,
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
            return (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3" key={space.id}>
                <label className="flex items-start gap-3">
                  <input
                    checked={selected}
                    onChange={(event) =>
                      setSelectedKnowledgeSpaceIds((previous) =>
                        event.target.checked
                          ? [...previous, space.id]
                          : previous.filter((value) => value !== space.id),
                      )
                    }
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--foreground)]">
                      {space.name}
                    </span>
                    <span className="block text-sm text-[var(--muted-foreground)]">
                      {space.description || t('knowledge.noDescription')}
                    </span>
                  </span>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => onEditSpace(space)} type="button" variant="ghost">
                    {t('knowledge.editSpace')}
                  </Button>
                  <Button onClick={() => onDeleteSpace(space)} type="button" variant="ghost">
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
