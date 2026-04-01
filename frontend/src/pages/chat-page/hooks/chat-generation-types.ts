import type { Conversation } from '../../../types/chat'

export interface ActiveGenerationState {
  id: number
  conversationId: Conversation['id']
  placeholderId: number
  messageId: number | null
  controller: AbortController
  stopRequested: boolean
  suppressCancelError?: boolean
  stopPromise: Promise<void> | null
}
