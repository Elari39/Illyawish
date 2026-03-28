import type { I18nContextValue } from '../../i18n/context'
import type { Attachment } from '../../types/chat'
import type { ComposerAttachment } from './types'
import { ATTACHMENT_INPUT_ACCEPT } from './types'
import { isImageAttachment } from './message-utils'

export function resolveAttachmentMimeType(file: File) {
  const fileType = file.type.trim()
  if (fileType) {
    return fileType
  }

  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'text/markdown'
  }
  if (lowerName.endsWith('.txt')) {
    return 'text/plain'
  }
  return ''
}

export function isSupportedAttachmentFile(file: File) {
  const mimeType = resolveAttachmentMimeType(file)
  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/plain'
  )
}

export function cleanupComposerAttachments(attachments: ComposerAttachment[]) {
  for (const attachment of attachments) {
    if (attachment.revokeOnCleanup && attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl)
    }
  }
}

export function createComposerAttachmentsFromMessageAttachments(
  attachments: Attachment[],
) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    previewUrl: isImageAttachment(attachment) ? attachment.url : undefined,
    attachment,
    revokeOnCleanup: false,
  }))
}

export async function buildAttachmentPayload(
  attachments: ComposerAttachment[],
  t: I18nContextValue['t'],
) {
  return attachments.map((attachment) => {
    if (!attachment.attachment) {
      throw new Error(
        attachment.name
          ? t('error.uploadAttachment', { name: attachment.name })
          : t('error.uploadAttachmentGeneric'),
      )
    }

    return attachment.attachment
  })
}

export function createAttachmentDraft(file: File): ComposerAttachment {
  const mimeType = resolveAttachmentMimeType(file)
  return {
    id: `${file.name}-${file.lastModified}-${Date.now()}`,
    name: file.name,
    mimeType,
    size: file.size,
    previewUrl: mimeType.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    file,
    isUploading: true,
    revokeOnCleanup: mimeType.startsWith('image/'),
  }
}

export { ATTACHMENT_INPUT_ACCEPT }
