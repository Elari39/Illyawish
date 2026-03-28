import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'
import type { KnowledgeSpace } from '../../../types/chat'

type KnowledgeSourceMode = 'text' | 'url' | 'attachment'

interface KnowledgeDocumentFormProps {
  knowledgeSpaces: KnowledgeSpace[]
  documentSpaceId: number | null
  sourceMode: KnowledgeSourceMode
  title: string
  sourceUri: string
  content: string
  attachmentFiles: File[]
  replacementFile: File | null
  isEditing: boolean
  onDocumentSpaceIdChange: (value: number | null) => void
  onSourceModeChange: (value: KnowledgeSourceMode) => void
  onTitleChange: (value: string) => void
  onSourceUriChange: (value: string) => void
  onContentChange: (value: string) => void
  onAttachmentFilesChange: (value: File[]) => void
  onReplacementFileChange: (value: File | null) => void
  onSubmit: () => void
  onCancelEdit: () => void
}

const knowledgeFileAccept = '.pdf,.md,.markdown,.txt,text/plain,text/markdown,application/pdf'

export function KnowledgeDocumentForm({
  knowledgeSpaces,
  documentSpaceId,
  sourceMode,
  title,
  sourceUri,
  content,
  attachmentFiles,
  replacementFile,
  isEditing,
  onDocumentSpaceIdChange,
  onSourceModeChange,
  onTitleChange,
  onSourceUriChange,
  onContentChange,
  onAttachmentFilesChange,
  onReplacementFileChange,
  onSubmit,
  onCancelEdit,
}: KnowledgeDocumentFormProps) {
  const { t } = useI18n()
  const isSubmitDisabled =
    documentSpaceId == null
      ? true
      : sourceMode === 'text'
        ? title.trim() === '' || content.trim() === ''
        : sourceMode === 'url'
          ? title.trim() === '' || sourceUri.trim() === ''
          : isEditing
            ? title.trim() === ''
            : attachmentFiles.length === 0

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {isEditing ? t('knowledge.editDocumentTitle') : t('knowledge.addDocumentTitle')}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
          {isEditing ? t('knowledge.editDocumentDescription') : t('knowledge.addDocumentDescription')}
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.documentSpace')}</span>
        <select
          aria-label={t('knowledge.documentSpace')}
          className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-4"
          value={documentSpaceId ?? ''}
          onChange={(event) => onDocumentSpaceIdChange(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">{t('knowledge.chooseSpace')}</option>
          {knowledgeSpaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {(['text', 'url', 'attachment'] as const).map((mode) => (
          <Button
            disabled={isEditing && sourceMode !== mode}
            key={mode}
            onClick={() => onSourceModeChange(mode)}
            type="button"
            variant={sourceMode === mode ? 'secondary' : 'ghost'}
          >
            {mode === 'text'
              ? t('knowledge.sourceText')
              : mode === 'url'
                ? t('knowledge.sourceURL')
                : t('knowledge.sourceAttachment')}
          </Button>
        ))}
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.documentTitle')}</span>
        <Input
          aria-label={t('knowledge.documentTitle')}
          placeholder={t('knowledge.documentTitlePlaceholder')}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>

      {sourceMode === 'text' ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.documentContent')}</span>
          <Textarea
            aria-label={t('knowledge.documentContent')}
            className="min-h-[160px] rounded-xl border border-[var(--line)] bg-white px-4 py-3"
            placeholder={t('knowledge.textContentPlaceholder')}
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
          />
        </label>
      ) : null}

      {sourceMode === 'url' ? (
        <>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.sourceURLField')}</span>
            <Input
              aria-label={t('knowledge.sourceURLField')}
              placeholder={t('knowledge.sourceURLPlaceholder')}
              value={sourceUri}
              onChange={(event) => onSourceUriChange(event.target.value)}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.documentContentOptional')}</span>
            <Textarea
              aria-label={t('knowledge.documentContentOptional')}
              className="min-h-[160px] rounded-xl border border-[var(--line)] bg-white px-4 py-3"
              placeholder={t('knowledge.urlContentPlaceholder')}
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
            />
          </label>
        </>
      ) : null}

      {sourceMode === 'attachment' ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {isEditing ? t('knowledge.uploadReplacementFile') : t('knowledge.uploadFiles')}
          </span>
          <Input
            accept={knowledgeFileAccept}
            aria-label={isEditing ? t('knowledge.uploadReplacementFile') : t('knowledge.uploadFiles')}
            multiple={!isEditing}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              if (isEditing) {
                onReplacementFileChange(files[0] ?? null)
                return
              }
              onAttachmentFilesChange(files)
            }}
            type="file"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            {isEditing ? t('knowledge.replaceFileHint') : t('knowledge.uploadHint')}
          </p>
          {isEditing && replacementFile ? (
            <p className="text-xs text-[var(--muted-foreground)]">{replacementFile.name}</p>
          ) : null}
          {!isEditing && attachmentFiles.length > 0 ? (
            <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
              <p className="text-xs font-medium text-[var(--foreground)]">{t('knowledge.selectedFiles')}</p>
              <div className="mt-2 grid gap-1">
                {attachmentFiles.map((file) => (
                  <p className="text-xs text-[var(--muted-foreground)]" key={`${file.name}-${file.size}`}>
                    {file.name}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isEditing ? (
          <Button onClick={onCancelEdit} type="button" variant="ghost">
            {t('knowledge.cancelDocumentEdit')}
          </Button>
        ) : null}
        <Button disabled={isSubmitDisabled} onClick={onSubmit} type="button">
          {isEditing ? t('knowledge.saveDocument') : t('knowledge.addDocument')}
        </Button>
      </div>
    </div>
  )
}
