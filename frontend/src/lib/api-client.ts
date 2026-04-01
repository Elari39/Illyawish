import { streamSSE } from './sse'
import {
  fetchOrThrow,
  notifyUnauthorized,
  shouldNotifyUnauthorized,
  toApiError,
} from './http'
import { normalizeMessage } from './api-normalizers'
import type { StreamEvent } from '../types/chat'

const API_BASE_URL = ''

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', 'application/json')

  const response = await fetchOrThrow(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const apiError = await toApiError(response)
    if (response.status === 401 && shouldNotifyUnauthorized(apiError.code)) {
      notifyUnauthorized(apiError.code)
    }
    throw apiError
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function streamChatRequest(
  path: string,
  payload: unknown,
  onEvent: (event: StreamEvent) => void | Promise<void>,
  method = 'POST',
  signal?: AbortSignal,
) {
  await streamSSE(
    `${API_BASE_URL}${path}`,
    {
      method,
      signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    },
    async (event) => {
      const parsed = JSON.parse(event.data) as StreamEvent
      parsed.type = event.event as StreamEvent['type']
      if (parsed.message) {
        parsed.message = normalizeMessage(parsed.message)
      }
      await onEvent(parsed)
    },
  )
}
