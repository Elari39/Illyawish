import { afterEach, describe, expect, it, vi } from 'vitest'

import { AUTH_UNAUTHORIZED_EVENT } from './http'
import { streamSSE } from './sse'

const encoder = new TextEncoder()

describe('streamSSE', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reassembles UTF-8 data split across chunks', async () => {
    const payload = 'event: delta\ndata: 你好 👋🙂\n\n'
    const encoded = encoder.encode(payload)
    const prefixLength = encoder.encode('event: delta\ndata: ').length

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createStreamResponse(
          [encoded.slice(0, prefixLength + 1), encoded.slice(prefixLength + 1)],
          { status: 200 },
        ),
      ),
    )

    const events: Array<{ event: string; data: string }> = []
    await streamSSE('/api/test', {}, async (event) => {
      events.push(event)
    })

    expect(events).toEqual([
      {
        event: 'delta',
        data: '你好 👋🙂',
      },
    ])
  })

  it('dispatches the final event without a trailing separator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createStreamResponse([encoder.encode('event: done\ndata: final payload')], {
          status: 200,
        }),
      ),
    )

    const events: Array<{ event: string; data: string }> = []
    await streamSSE('/api/test', {}, async (event) => {
      events.push(event)
    })

    expect(events).toEqual([
      {
        event: 'done',
        data: 'final payload',
      },
    ])
  })

  it('dispatches multiple events from a single chunk in order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createStreamResponse(
          [
            encoder.encode(
              [
                'event: message_start',
                'data: first',
                '',
                'event: delta',
                'data: second',
                '',
              ].join('\n'),
            ),
          ],
          { status: 200 },
        ),
      ),
    )

    const events: Array<{ event: string; data: string }> = []
    await streamSSE('/api/test', {}, async (event) => {
      events.push(event)
    })

    expect(events).toEqual([
      {
        event: 'message_start',
        data: 'first',
      },
      {
        event: 'delta',
        data: 'second',
      },
    ])
  })

  it('throws API errors for non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })),
    )

    await expect(
      streamSSE('/api/test', {}, async () => {}),
    ).rejects.toMatchObject({
      message: 'bad gateway',
      status: 502,
    })
  })

  it('notifies unauthorized listeners before throwing 401 errors', async () => {
    const unauthorizedEvent = new Promise<{ code?: string }>((resolve) => {
      window.addEventListener(
        AUTH_UNAUTHORIZED_EVENT,
        (event) => {
          resolve((event as CustomEvent<{ code?: string }>).detail)
        },
        { once: true },
      )
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'session expired',
            code: 'session_expired',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )

    await expect(
      streamSSE('/api/test', {}, async () => {}),
    ).rejects.toMatchObject({
      message: 'session expired',
      status: 401,
      code: 'session_expired',
    })

    await expect(unauthorizedEvent).resolves.toEqual({
      code: 'session_expired',
    })
  })
})

function createStreamResponse(chunks: Uint8Array[], init: ResponseInit) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })

  return new Response(stream, init)
}
