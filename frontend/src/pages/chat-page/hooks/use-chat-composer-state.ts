import { useCallback, useEffect, useRef, useState } from 'react'

import { attachmentApi } from '../../../lib/api'
import type { I18nContextValue } from '../../../i18n/context'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  type ComposerAttachment,
} from '../types'
import {
  cleanupComposerAttachments,
  createAttachmentDraft,
  createComposerAttachmentsFromMessageAttachments,
  isSupportedAttachmentFile,
} from '../utils'
import type { Message } from '../../../types/chat'

interface UseChatComposerStateOptions {
  setChatError: (value: string | null) => void
  t: I18nContextValue['t']
}

export function useChatComposerState({
  setChatError,
  t,
}: UseChatComposerStateOptions) {
  const composerFormRef = useRef<HTMLFormElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerIsComposingRef = useRef(false)
  const selectedAttachmentsRef = useRef<ComposerAttachment[]>([])

  const [composerValue, setComposerValue] = useState('')
  const [selectedAttachments, setSelectedAttachments] = useState<ComposerAttachment[]>([])
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)

  const hasPendingUploads = selectedAttachments.some((attachment) => attachment.isUploading)

  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments
  }, [selectedAttachments])

  useEffect(() => {
    return () => {
      cleanupComposerAttachments(selectedAttachmentsRef.current)
    }
  }, [])

  const clearSelectedAttachments = useCallback(() => {
    setSelectedAttachments((previous) => {
      cleanupComposerAttachments(previous)
      return []
    })
  }, [])

  const replaceSelectedAttachments = useCallback((nextAttachments: ComposerAttachment[]) => {
    setSelectedAttachments((previous) => {
      cleanupComposerAttachments(previous)
      return nextAttachments
    })
  }, [])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (!isSupportedAttachmentFile(file)) {
        setChatError(t('error.onlyAttachments'))
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setChatError(t('error.attachmentTooLarge', { name: file.name }))
        continue
      }
      if (selectedAttachmentsRef.current.length >= MAX_ATTACHMENTS) {
        setChatError(t('error.maxAttachments', { count: MAX_ATTACHMENTS }))
        break
      }

      const draftAttachment = createAttachmentDraft(file)
      setSelectedAttachments((previous) => [...previous, draftAttachment])

      try {
        const attachment = await attachmentApi.upload(file)
        setSelectedAttachments((previous) =>
          previous.map((item) =>
            item.id === draftAttachment.id
              ? {
                  ...item,
                  attachment,
                  isUploading: false,
                }
              : item,
          ),
        )
        setChatError(null)
      } catch (error) {
        setSelectedAttachments((previous) => {
          const failedAttachment = previous.find((item) => item.id === draftAttachment.id)
          if (failedAttachment?.revokeOnCleanup && failedAttachment.previewUrl) {
            URL.revokeObjectURL(failedAttachment.previewUrl)
          }
          return previous.filter((item) => item.id !== draftAttachment.id)
        })

        const message =
          error instanceof Error
            ? error.message
            : t('error.uploadAttachmentGeneric')
        setChatError(message || t('error.uploadAttachment', { name: file.name }))
      }
    }
  }, [setChatError, t])

  const removeSelectedAttachment = useCallback((id: string) => {
    setSelectedAttachments((previous) => {
      const attachment = previous.find((item) => item.id === id)
      if (attachment?.revokeOnCleanup && attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
      return previous.filter((item) => item.id !== id)
    })
  }, [])

  const startEditingMessage = useCallback((message: Message) => {
    if (message.role !== 'user') {
      return
    }

    setEditingMessageId(message.id)
    setComposerValue(message.content)
    replaceSelectedAttachments(
      createComposerAttachmentsFromMessageAttachments(message.attachments),
    )
  }, [replaceSelectedAttachments])

  const clearEditingMessage = useCallback(() => {
    setEditingMessageId(null)
  }, [])

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null)
    setComposerValue('')
    clearSelectedAttachments()
  }, [clearSelectedAttachments])

  const resetComposer = useCallback(() => {
    setComposerValue('')
    clearSelectedAttachments()
    setEditingMessageId(null)
  }, [clearSelectedAttachments])

  return {
    composerFormRef,
    fileInputRef,
    composerIsComposingRef,
    selectedAttachmentsRef,
    composerValue,
    selectedAttachments,
    editingMessageId,
    hasPendingUploads,
    setComposerValue,
    clearEditingMessage,
    cancelEditingMessage,
    handleFilesSelected,
    removeSelectedAttachment,
    resetComposer,
    startEditingMessage,
  }
}
