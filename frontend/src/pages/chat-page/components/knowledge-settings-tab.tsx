import type {
  KnowledgeDocument,
  KnowledgeSpace,
  UpdateKnowledgeDocumentPayload,
  UpdateKnowledgeSpacePayload,
} from '../../../types/chat'
import { ConfirmationDialog } from './confirmation-dialog'
import {
  createEmptyDocumentDraft,
  useKnowledgeSettingsState,
} from './knowledge-settings/use-knowledge-settings-state'
import { KnowledgeDocumentForm } from './knowledge-document-form'
import { KnowledgeDocumentList } from './knowledge-document-list'
import { KnowledgeSpaceForm } from './knowledge-space-form'
import { KnowledgeSpaceList } from './knowledge-space-list'

interface KnowledgeSettingsTabProps {
  knowledgeSpaces: KnowledgeSpace[]
  knowledgeDocuments: Record<number, KnowledgeDocument[]>
  selectedKnowledgeSpaceIds: number[]
  pendingKnowledgeSpaceIds: number[]
  onToggleKnowledgeSpace: (space: KnowledgeSpace) => void | Promise<void>
  loadKnowledgeDocuments: (spaceId: number) => Promise<void>
  createKnowledgeSpace: (payload: { name: string; description?: string }) => Promise<KnowledgeSpace | null>
  updateKnowledgeSpace: (
    spaceId: number,
    payload: UpdateKnowledgeSpacePayload,
  ) => Promise<KnowledgeSpace | null>
  deleteKnowledgeSpace: (spaceId: number) => Promise<boolean>
  createKnowledgeDocument: (
    spaceId: number,
    payload: { title: string; sourceType: string; sourceUri?: string; content: string },
  ) => Promise<KnowledgeDocument | null>
  updateKnowledgeDocument: (
    spaceId: number,
    documentId: number,
    payload: UpdateKnowledgeDocumentPayload,
  ) => Promise<KnowledgeDocument | null>
  deleteKnowledgeDocument: (spaceId: number, documentId: number) => Promise<boolean>
  uploadKnowledgeDocuments: (
    spaceId: number,
    files: File[],
  ) => Promise<KnowledgeDocument[] | null>
  replaceKnowledgeDocumentFile: (
    spaceId: number,
    documentId: number,
    file: File,
    title?: string,
  ) => Promise<KnowledgeDocument | null>
}

export function KnowledgeSettingsTab({
  knowledgeSpaces,
  knowledgeDocuments,
  selectedKnowledgeSpaceIds,
  pendingKnowledgeSpaceIds,
  onToggleKnowledgeSpace,
  loadKnowledgeDocuments,
  createKnowledgeSpace,
  updateKnowledgeSpace,
  deleteKnowledgeSpace,
  createKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  uploadKnowledgeDocuments,
  replaceKnowledgeDocumentFile,
}: KnowledgeSettingsTabProps) {
  const {
    activeDocuments,
    confirmation,
    documentDraft,
    documentSpaceId,
    editingDocument,
    editingSpace,
    spaceDescription,
    spaceName,
    setConfirmation,
    setDocumentDraft,
    setDocumentSpaceId,
    setEditingSpace,
    setSpaceDescription,
    setSpaceName,
    handleDeleteDocument,
    handleDeleteSpace,
    handleSaveDocument,
    handleSaveSpace,
    resetDocumentForm,
    resetSpaceForm,
    syncDocumentDraft,
  } = useKnowledgeSettingsState({
    knowledgeDocuments,
    loadKnowledgeDocuments,
    createKnowledgeSpace,
    updateKnowledgeSpace,
    deleteKnowledgeSpace,
    createKnowledgeDocument,
    updateKnowledgeDocument,
    deleteKnowledgeDocument,
    uploadKnowledgeDocuments,
    replaceKnowledgeDocumentFile,
  })

  return (
    <>
      <div className="mt-6 grid gap-5">
        <KnowledgeSpaceList
          knowledgeSpaces={knowledgeSpaces}
          onToggleSpace={onToggleKnowledgeSpace}
          onDeleteSpace={handleDeleteSpace}
          onEditSpace={(space) => {
            setEditingSpace(space)
            setSpaceName(space.name)
            setSpaceDescription(space.description)
          }}
          pendingKnowledgeSpaceIds={pendingKnowledgeSpaceIds}
          selectedKnowledgeSpaceIds={selectedKnowledgeSpaceIds}
        />

        <KnowledgeSpaceForm
          isEditing={editingSpace != null}
          onCancelEdit={resetSpaceForm}
          onSpaceDescriptionChange={setSpaceDescription}
          onSpaceNameChange={setSpaceName}
          onSubmit={() => void handleSaveSpace()}
          spaceDescription={spaceDescription}
          spaceName={spaceName}
        />

        <div className="space-y-4">
          <KnowledgeDocumentForm
            attachmentFiles={documentDraft.attachmentFiles}
            content={documentDraft.content}
            documentSpaceId={documentSpaceId}
            isEditing={editingDocument != null}
            knowledgeSpaces={knowledgeSpaces}
            onAttachmentFilesChange={(attachmentFiles) =>
              setDocumentDraft((previous) => ({ ...previous, attachmentFiles }))
            }
            onCancelEdit={() => resetDocumentForm(documentDraft.sourceMode)}
            onContentChange={(content) =>
              setDocumentDraft((previous) => ({ ...previous, content }))
            }
            onDocumentSpaceIdChange={setDocumentSpaceId}
            onReplacementFileChange={(replacementFile) =>
              setDocumentDraft((previous) => ({ ...previous, replacementFile }))
            }
            onSourceModeChange={(sourceMode) =>
              setDocumentDraft((previous) => ({
                ...createEmptyDocumentDraft(sourceMode),
                title: editingDocument?.sourceType === 'attachment' ? previous.title : '',
              }))
            }
            onSourceUriChange={(sourceUri) =>
              setDocumentDraft((previous) => ({ ...previous, sourceUri }))
            }
            onSubmit={() => void handleSaveDocument()}
            onTitleChange={(title) =>
              setDocumentDraft((previous) => ({ ...previous, title }))
            }
            replacementFile={documentDraft.replacementFile}
            sourceMode={documentDraft.sourceMode}
            sourceUri={documentDraft.sourceUri}
            title={documentDraft.title}
          />

          {documentSpaceId != null ? (
            <KnowledgeDocumentList
              documents={activeDocuments}
              onDeleteDocument={handleDeleteDocument}
              onEditDocument={syncDocumentDraft}
              onRefresh={() => void loadKnowledgeDocuments(documentSpaceId)}
              onReplaceFile={(document) => {
                syncDocumentDraft(document)
                setDocumentDraft((previous) => ({
                  ...previous,
                  sourceMode: 'attachment',
                  replacementFile: null,
                }))
              }}
            />
          ) : null}
        </div>
      </div>

      <ConfirmationDialog
        confirmation={confirmation}
        onClose={() => setConfirmation(null)}
      />
    </>
  )
}
