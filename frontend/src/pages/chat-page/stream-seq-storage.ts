const STREAM_SEQ_STORAGE_PREFIX = 'aichat:stream-seq:'

function buildStreamSeqStorageKey(conversationId: string) {
  return `${STREAM_SEQ_STORAGE_PREFIX}${conversationId}`
}

export function readLastEventSeq(conversationId: string) {
  if (typeof window === 'undefined') {
    return 0
  }

  const rawValue = window.sessionStorage.getItem(buildStreamSeqStorageKey(conversationId))
  if (!rawValue) {
    return 0
  }

  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function writeLastEventSeq(conversationId: string, lastEventSeq: number) {
  if (typeof window === 'undefined') {
    return
  }

  const value =
    Number.isFinite(lastEventSeq) && lastEventSeq > 0
      ? String(lastEventSeq)
      : '0'
  window.sessionStorage.setItem(buildStreamSeqStorageKey(conversationId), value)
}

