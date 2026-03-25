export interface ParsedSSEEvent {
  event: string
  data: string
}

export async function streamSSE(
  input: RequestInfo | URL,
  init: RequestInit,
  onEvent: (event: ParsedSSEEvent) => void | Promise<void>,
) {
  const response = await fetch(input, init)

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    const text = await response.text()
    try {
      const payload = JSON.parse(text) as { error?: string }
      if (payload.error) {
        message = payload.error
      }
    } catch {
      if (text.trim()) {
        message = text.trim()
      }
    }

    throw new Error(message)
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

    buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex).trim()
      buffer = buffer.slice(separatorIndex + 2)

      if (rawEvent) {
        const parsed = parseEvent(rawEvent)
        if (parsed) {
          await onEvent(parsed)
        }
      }

      separatorIndex = buffer.indexOf('\n\n')
    }
  }
}

function parseEvent(rawEvent: string): ParsedSSEEvent | null {
  const lines = rawEvent.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
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
