import { readSessionStorage, writeSessionStorage } from '../../lib/storage'

const STREAM_SEQ_STORAGE_PREFIX = 'aichat:stream-seq:'

function buildStreamSeqStorageKey(conversationId: string) {
  return `${STREAM_SEQ_STORAGE_PREFIX}${conversationId}`
}

export function readLastEventSeq(conversationId: string) {
  const rawValue = readSessionStorage(buildStreamSeqStorageKey(conversationId))
  if (!rawValue) {
    return 0
  }

  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function writeLastEventSeq(conversationId: string, lastEventSeq: number) {
  const value =
    Number.isFinite(lastEventSeq) && lastEventSeq > 0
      ? String(lastEventSeq)
      : '0'
  writeSessionStorage(buildStreamSeqStorageKey(conversationId), value)
}
