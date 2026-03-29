import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'

interface KnowledgeSpaceFormProps {
  spaceName: string
  spaceDescription: string
  isEditing: boolean
  onSpaceNameChange: (value: string) => void
  onSpaceDescriptionChange: (value: string) => void
  onSubmit: () => void
  onCancelEdit: () => void
}

export function KnowledgeSpaceForm({
  spaceName,
  spaceDescription,
  isEditing,
  onSpaceNameChange,
  onSpaceDescriptionChange,
  onSubmit,
  onCancelEdit,
}: KnowledgeSpaceFormProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {isEditing ? t('knowledge.editSpaceTitle') : t('knowledge.createSpaceTitle')}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
          {isEditing ? t('knowledge.editSpaceDescription') : t('knowledge.createSpaceDescription')}
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.spaceName')}</span>
        <Input
          aria-label={t('knowledge.spaceName')}
          placeholder={t('knowledge.spaceNamePlaceholder')}
          value={spaceName}
          onChange={(event) => onSpaceNameChange(event.target.value)}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.spaceDescription')}</span>
        <Textarea
          aria-label={t('knowledge.spaceDescription')}
          className="min-h-[120px] rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3"
          placeholder={t('knowledge.spaceDescriptionPlaceholder')}
          value={spaceDescription}
          onChange={(event) => onSpaceDescriptionChange(event.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {isEditing ? (
          <Button onClick={onCancelEdit} type="button" variant="ghost">
            {t('knowledge.cancelSpaceEdit')}
          </Button>
        ) : null}
        <Button disabled={spaceName.trim() === ''} onClick={onSubmit} type="button">
          {isEditing ? t('knowledge.saveSpace') : t('knowledge.createSpace')}
        </Button>
      </div>
    </div>
  )
}
