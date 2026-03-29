import { useEffect, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import type {
  KnowledgeDocument,
  KnowledgeSpace,
  UpdateKnowledgeDocumentPayload,
  UpdateKnowledgeSpacePayload,
} from '../../../types/chat'
import type { ConfirmationState } from '../types'
import { ConfirmationDialog } from './confirmation-dialog'
import { KnowledgeDocumentForm } from './knowledge-document-form'
import { KnowledgeDocumentList } from './knowledge-document-list'
import { KnowledgeSpaceForm } from './knowledge-space-form'
import { KnowledgeSpaceList } from './knowledge-space-list'

type KnowledgeSourceMode = 'text' | 'url' | 'attachment'

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

function createEmptyDocumentDraft(sourceMode: KnowledgeSourceMode = 'text') {
  return {
    sourceMode,
    title: '',
    sourceUri: '',
    content: '',
    attachmentFiles: [] as File[],
    replacementFile: null as File | null,
  }
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
  const { t } = useI18n()
  const [spaceName, setSpaceName] = useState('')
  const [spaceDescription, setSpaceDescription] = useState('')
  const [editingSpace, setEditingSpace] = useState<KnowledgeSpace | null>(null)
  const [documentSpaceId, setDocumentSpaceId] = useState<number | null>(null)
  const [editingDocument, setEditingDocument] = useState<KnowledgeDocument | null>(null)
  const [documentDraft, setDocumentDraft] = useState(createEmptyDocumentDraft())
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)

  useEffect(() => {
    if (documentSpaceId == null) {
      return
    }
    if (knowledgeDocuments[documentSpaceId] !== undefined) {
      return
    }
    void loadKnowledgeDocuments(documentSpaceId)
  }, [documentSpaceId, knowledgeDocuments, loadKnowledgeDocuments])

  function resetSpaceForm() {
    setSpaceName('')
    setSpaceDescription('')
    setEditingSpace(null)
  }

  function resetDocumentForm(sourceMode: KnowledgeSourceMode = 'text') {
    setEditingDocument(null)
    setDocumentDraft(createEmptyDocumentDraft(sourceMode))
  }

  function syncDocumentDraft(document: KnowledgeDocument) {
    setEditingDocument(document)
    setDocumentSpaceId(document.knowledgeSpaceId)
    setDocumentDraft({
      sourceMode: document.sourceType as KnowledgeSourceMode,
      title: document.title,
      sourceUri: document.sourceUri,
      content: document.content,
      attachmentFiles: [],
      replacementFile: null,
    })
  }

  async function handleSaveSpace() {
    if (editingSpace) {
      const updated = await updateKnowledgeSpace(editingSpace.id, {
        name: spaceName,
        description: spaceDescription,
      })
      if (!updated) {
        return
      }
      resetSpaceForm()
      return
    }

    const created = await createKnowledgeSpace({
      name: spaceName,
      description: spaceDescription,
    })
    if (!created) {
      return
    }

    setDocumentSpaceId(created.id)
    resetSpaceForm()
  }

  async function handleSaveDocument() {
    if (documentSpaceId == null) {
      return
    }

    if (editingDocument) {
      if (documentDraft.sourceMode === 'attachment') {
        if (documentDraft.replacementFile) {
          const replaced = await replaceKnowledgeDocumentFile(
            documentSpaceId,
            editingDocument.id,
            documentDraft.replacementFile,
            documentDraft.title,
          )
          if (!replaced) {
            return
          }
        } else {
          const updated = await updateKnowledgeDocument(documentSpaceId, editingDocument.id, {
            title: documentDraft.title,
          })
          if (!updated) {
            return
          }
        }
        resetDocumentForm('attachment')
        return
      }

      const updated = await updateKnowledgeDocument(documentSpaceId, editingDocument.id, {
        title: documentDraft.title,
        sourceUri:
          documentDraft.sourceMode === 'url' ? documentDraft.sourceUri || undefined : undefined,
        content: documentDraft.content,
      })
      if (!updated) {
        return
      }
      resetDocumentForm(documentDraft.sourceMode)
      return
    }

    if (documentDraft.sourceMode === 'attachment') {
      const uploaded = await uploadKnowledgeDocuments(documentSpaceId, documentDraft.attachmentFiles)
      if (!uploaded) {
        return
      }
      resetDocumentForm('attachment')
      return
    }

    const created = await createKnowledgeDocument(documentSpaceId, {
      title: documentDraft.title,
      sourceType: documentDraft.sourceMode,
      sourceUri: documentDraft.sourceMode === 'url' ? documentDraft.sourceUri || undefined : undefined,
      content: documentDraft.content,
    })
    if (!created) {
      return
    }
    resetDocumentForm(documentDraft.sourceMode)
  }

  function handleDeleteSpace(space: KnowledgeSpace) {
    setConfirmation({
      title: t('knowledge.deleteSpace'),
      description: t('confirm.deleteKnowledgeSpace', { name: space.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        const deleted = await deleteKnowledgeSpace(space.id)
        if (!deleted) {
          return
        }
        if (documentSpaceId === space.id) {
          setDocumentSpaceId(null)
          resetDocumentForm()
        }
        if (editingSpace?.id === space.id) {
          resetSpaceForm()
        }
      },
    })
  }

  function handleDeleteDocument(document: KnowledgeDocument) {
    setConfirmation({
      title: t('knowledge.deleteDocument'),
      description: t('confirm.deleteKnowledgeDocument', { name: document.title }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        await deleteKnowledgeDocument(document.knowledgeSpaceId, document.id)
        if (editingDocument?.id === document.id) {
          resetDocumentForm()
        }
      },
    })
  }

  const activeDocuments = documentSpaceId == null ? [] : (knowledgeDocuments[documentSpaceId] ?? [])

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
