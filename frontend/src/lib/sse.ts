import {
  fetchOrThrow,
  notifyUnauthorized,
  toApiError,
} from './http'

export interface ParsedSSEEvent {
  event: string
  data: string
}

export async function streamSSE(
  input: RequestInfo | URL,
  init: RequestInit,
  onEvent: (event: ParsedSSEEvent) => void | Promise<void>,
) {
  const response = await fetchOrThrow(input, init)

  if (!response.ok) {
    const apiError = await toApiError(response)
    if (response.status === 401 && typeof window !== 'undefined') {
      notifyUnauthorized(apiError.code)
    }

    throw apiError
  }

  if (!response.body) {
    throw new Error('Streaming response body is unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += normalizeChunk(decoder.decode(value, { stream: true }))
    buffer = await dispatchBufferedEvents(buffer, onEvent)
  }

  buffer += normalizeChunk(decoder.decode())
  await dispatchBufferedEvents(buffer, onEvent, true)
}

async function dispatchBufferedEvents(
  buffer: string,
  onEvent: (event: ParsedSSEEvent) => void | Promise<void>,
  flushRemaining = false,
) {
  let separatorIndex = buffer.indexOf('\n\n')
  while (separatorIndex >= 0) {
    const rawEvent = buffer.slice(0, separatorIndex)
    buffer = buffer.slice(separatorIndex + 2)
    await dispatchParsedEvent(rawEvent, onEvent)
    separatorIndex = buffer.indexOf('\n\n')
  }

  if (flushRemaining) {
    const trailingEvent = buffer.replace(/\n+$/g, '')
    if (trailingEvent !== '') {
      await dispatchParsedEvent(trailingEvent, onEvent)
    }
    return ''
  }

  return buffer
}

async function dispatchParsedEvent(
  rawEvent: string,
  onEvent: (event: ParsedSSEEvent) => void | Promise<void>,
) {
  const parsed = parseEvent(rawEvent)
  if (parsed) {
    await onEvent(parsed)
  }
}

function normalizeChunk(chunk: string) {
  return chunk.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function parseEvent(rawEvent: string): ParsedSSEEvent | null {
  const lines = rawEvent.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line === '' || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      event = parseFieldValue(line.slice(6)) || 'message'
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(parseFieldValue(line.slice(5)))
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

function parseFieldValue(value: string) {
  if (value.startsWith(' ')) {
    return value.slice(1)
  }

  return value
}
