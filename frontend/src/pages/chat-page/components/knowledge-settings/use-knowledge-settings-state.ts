import { useEffect, useState } from 'react'

import { useI18n } from '../../../../i18n/use-i18n'
import type {
  KnowledgeDocument,
  KnowledgeSpace,
  UpdateKnowledgeDocumentPayload,
  UpdateKnowledgeSpacePayload,
} from '../../../../types/chat'
import type { ConfirmationState } from '../../types'

export type KnowledgeSourceMode = 'text' | 'url' | 'attachment'

interface UseKnowledgeSettingsStateOptions {
  knowledgeDocuments: Record<number, KnowledgeDocument[]>
  loadKnowledgeDocuments: (spaceId: number) => Promise<void>
  createKnowledgeSpace: (payload: {
    name: string
    description?: string
  }) => Promise<KnowledgeSpace | null>
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

export function useKnowledgeSettingsState({
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
}: UseKnowledgeSettingsStateOptions) {
  const { t } = useI18n()
  const [spaceName, setSpaceName] = useState('')
  const [spaceDescription, setSpaceDescription] = useState('')
  const [editingSpace, setEditingSpace] = useState<KnowledgeSpace | null>(null)
  const [documentSpaceId, setDocumentSpaceId] = useState<number | null>(null)
  const [editingDocument, setEditingDocument] =
    useState<KnowledgeDocument | null>(null)
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
          const updated = await updateKnowledgeDocument(
            documentSpaceId,
            editingDocument.id,
            {
              title: documentDraft.title,
            },
          )
          if (!updated) {
            return
          }
        }
        resetDocumentForm('attachment')
        return
      }

      const updated = await updateKnowledgeDocument(
        documentSpaceId,
        editingDocument.id,
        {
          title: documentDraft.title,
          sourceUri:
            documentDraft.sourceMode === 'url'
              ? documentDraft.sourceUri || undefined
              : undefined,
          content: documentDraft.content,
        },
      )
      if (!updated) {
        return
      }
      resetDocumentForm(documentDraft.sourceMode)
      return
    }

    if (documentDraft.sourceMode === 'attachment') {
      const uploaded = await uploadKnowledgeDocuments(
        documentSpaceId,
        documentDraft.attachmentFiles,
      )
      if (!uploaded) {
        return
      }
      resetDocumentForm('attachment')
      return
    }

    const created = await createKnowledgeDocument(documentSpaceId, {
      title: documentDraft.title,
      sourceType: documentDraft.sourceMode,
      sourceUri:
        documentDraft.sourceMode === 'url'
          ? documentDraft.sourceUri || undefined
          : undefined,
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

  const activeDocuments =
    documentSpaceId == null ? [] : (knowledgeDocuments[documentSpaceId] ?? [])

  return {
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
  }
}

export function createEmptyDocumentDraft(
  sourceMode: KnowledgeSourceMode = 'text',
) {
  return {
    sourceMode,
    title: '',
    sourceUri: '',
    content: '',
    attachmentFiles: [] as File[],
    replacementFile: null as File | null,
  }
}
