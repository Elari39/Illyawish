import type { StreamEvent } from '../../types/chat'

export interface StoredExecutionPanelState {
  events: StreamEvent[]
  pendingConfirmationId: string | null
  lastEventSeq: number
}

const EXECUTION_PANEL_STORAGE_PREFIX = 'aichat:execution-panel:'

export function buildExecutionPanelStorageKey(conversationId: string) {
  return `${EXECUTION_PANEL_STORAGE_PREFIX}${conversationId}`
}

export function readExecutionPanelState(
  conversationId: string,
): StoredExecutionPanelState {
  if (typeof window === 'undefined') {
    return emptyExecutionPanelState()
  }

  const storageKey = buildExecutionPanelStorageKey(conversationId)
  const rawValue = window.sessionStorage.getItem(storageKey)
  if (!rawValue) {
    return emptyExecutionPanelState()
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredExecutionPanelState>
    if (!Array.isArray(parsed.events)) {
      throw new Error('invalid execution panel events')
    }

    return {
      events: parsed.events as StreamEvent[],
      pendingConfirmationId:
        typeof parsed.pendingConfirmationId === 'string'
          ? parsed.pendingConfirmationId
          : null,
      lastEventSeq:
        typeof parsed.lastEventSeq === 'number' && Number.isFinite(parsed.lastEventSeq)
          ? parsed.lastEventSeq
          : 0,
    }
  } catch {
    window.sessionStorage.removeItem(storageKey)
    return emptyExecutionPanelState()
  }
}

export function writeExecutionPanelState(
  conversationId: string,
  state: StoredExecutionPanelState,
) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(
    buildExecutionPanelStorageKey(conversationId),
    JSON.stringify(state),
  )
}

export function clearExecutionPanelState(conversationId: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(buildExecutionPanelStorageKey(conversationId))
}

export function readLastEventSeq(conversationId: string) {
  return readExecutionPanelState(conversationId).lastEventSeq
}

export function writeLastEventSeq(conversationId: string, lastEventSeq: number) {
  const state = readExecutionPanelState(conversationId)
  writeExecutionPanelState(conversationId, {
    ...state,
    lastEventSeq,
  })
}

function emptyExecutionPanelState(): StoredExecutionPanelState {
  return {
    events: [],
    pendingConfirmationId: null,
    lastEventSeq: 0,
  }
}
