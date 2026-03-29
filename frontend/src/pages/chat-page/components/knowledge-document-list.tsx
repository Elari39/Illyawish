import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { KnowledgeDocument } from '../../../types/chat'

interface KnowledgeDocumentListProps {
  documents: KnowledgeDocument[]
  onRefresh: () => void
  onEditDocument: (document: KnowledgeDocument) => void
  onDeleteDocument: (document: KnowledgeDocument) => void
  onReplaceFile: (document: KnowledgeDocument) => void
}

export function KnowledgeDocumentList({
  documents,
  onRefresh,
  onEditDocument,
  onDeleteDocument,
  onReplaceFile,
}: KnowledgeDocumentListProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--foreground)]">{t('knowledge.documentsTitle')}</p>
        <Button onClick={onRefresh} type="button" variant="ghost">
          {t('knowledge.refreshDocuments')}
        </Button>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t('knowledge.noDocuments')}</p>
      ) : (
        documents.map((document) => (
          <div className="rounded-lg border border-[var(--line)] px-3 py-2" key={document.id}>
            <p className="text-sm font-medium text-[var(--foreground)]">{document.title}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {document.sourceType} · {document.chunkCount} {t('knowledge.chunkSuffix')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => onEditDocument(document)} type="button" variant="ghost">
                {t('knowledge.editDocument')}
              </Button>
              {document.sourceType === 'attachment' ? (
                <Button onClick={() => onReplaceFile(document)} type="button" variant="ghost">
                  {t('knowledge.replaceFile')}
                </Button>
              ) : null}
              <Button onClick={() => onDeleteDocument(document)} type="button" variant="ghost">
                {t('knowledge.deleteDocument')}
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
