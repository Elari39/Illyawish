export const AUTH_UNAUTHORIZED_EVENT = 'aichat:unauthorized'
export const BACKEND_UNREACHABLE_CODE = 'backend_unreachable'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export class ApiNetworkError extends Error {
  code: string
  cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ApiNetworkError'
    this.code = BACKEND_UNREACHABLE_CODE
    this.cause = cause
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export async function fetchOrThrow(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new ApiNetworkError('Unable to reach the backend service.', error)
  }
}

export async function toApiError(response: Response) {
  let message = `Request failed with status ${response.status}`
  let code: string | undefined
  const text = await response.text()
  try {
    const payload = JSON.parse(text) as { error?: string; code?: string }
    if (payload.error) {
      message = payload.error
    }
    if (payload.code) {
      code = payload.code
    }
  } catch {
    if (text.trim()) {
      message = text.trim()
    }
  }

  return new ApiError(message, response.status, code)
}

export function shouldNotifyUnauthorized(code?: string) {
  return code === 'unauthorized' ||
    code === 'session_expired' ||
    code === 'session_revoked' ||
    code === 'account_disabled'
}

export function notifyUnauthorized(code?: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent(AUTH_UNAUTHORIZED_EVENT, {
      detail: { code },
    }),
  )
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

export function isNetworkError(error: unknown) {
  return error instanceof ApiNetworkError
}
