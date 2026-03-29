import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import { ApiError, isAbortError } from '../../../lib/http'
import type { Conversation, Message } from '../../../types/chat'
import type { ActiveGenerationState } from './chat-generation-types'

interface BeginGenerationOptions {
  conversationId: Conversation['id']
  placeholderId: number
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>
  nextGenerationIdRef: MutableRefObject<number>
  setIsSending: Dispatch<SetStateAction<boolean>>
  setChatError: (value: string | null) => void
  resetExecutionState: (conversationId: Conversation['id']) => void
}

export function beginGeneration({
  conversationId,
  placeholderId,
  activeGenerationRef,
  nextGenerationIdRef,
  setIsSending,
  setChatError,
  resetExecutionState,
}: BeginGenerationOptions) {
  const generation: ActiveGenerationState = {
    id: nextGenerationIdRef.current + 1,
    conversationId,
    placeholderId,
    messageId: null,
    controller: new AbortController(),
    stopRequested: false,
    stopPromise: null,
  }

  nextGenerationIdRef.current = generation.id
  activeGenerationRef.current = generation
  setIsSending(true)
  setChatError(null)
  resetExecutionState(conversationId)
  return generation
}

export function syncGenerationMessageId(
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>,
  placeholderId: number,
  message: Message | undefined,
) {
  const activeGeneration = activeGenerationRef.current
  if (
    !activeGeneration ||
    !message ||
    activeGeneration.conversationId !== message.conversationId
  ) {
    return
  }

  if (
    activeGeneration.placeholderId === placeholderId ||
    activeGeneration.messageId === placeholderId ||
    activeGeneration.messageId === message.id
  ) {
    activeGeneration.messageId = message.id
  }
}

interface FinalizeGenerationOptions {
  generationId: number
  activeGenerationRef: MutableRefObject<ActiveGenerationState | null>
  flushActiveMessageDelta: () => void
  setIsSending: Dispatch<SetStateAction<boolean>>
}

export async function finalizeGeneration({
  generationId,
  activeGenerationRef,
  flushActiveMessageDelta,
  setIsSending,
}: FinalizeGenerationOptions) {
  if (activeGenerationRef.current?.id !== generationId) {
    return
  }

  flushActiveMessageDelta()
  activeGenerationRef.current = null
  setIsSending(false)
}

interface SettleGenerationCleanupOptions {
  generation: ActiveGenerationState | null
  finalizeGeneration: (generationId: number) => Promise<void>
  setIsSending: Dispatch<SetStateAction<boolean>>
}

export async function settleGenerationCleanup({
  generation,
  finalizeGeneration,
  setIsSending,
}: SettleGenerationCleanupOptions) {
  if (!generation) {
    setIsSending(false)
    return
  }

  if (generation.stopRequested && generation.stopPromise) {
    await generation.stopPromise
    return
  }

  await finalizeGeneration(generation.id)
}

export function isIgnorableStopError(error: unknown) {
  return (
    isAbortError(error) ||
    (error instanceof ApiError &&
      error.status === 409 &&
      error.message === 'no active generation for this conversation')
  )
}

