import { describe, expect, it } from 'vitest'

import type { KnowledgeDocument } from '../../../../types/chat'
import {
  clearKnowledgeSpaceDocuments,
  prependKnowledgeDocuments,
  removeKnowledgeDocument,
  resolveWorkspaceLoadError,
  upsertKnowledgeDocument,
} from './helpers'

function createDocument(
  id: number,
  knowledgeSpaceId = 11,
  overrides: Partial<KnowledgeDocument> = {},
): KnowledgeDocument {
  return {
    id,
    userId: 3,
    knowledgeSpaceId,
    title: `Document ${id}`,
    sourceType: 'text',
    sourceUri: '',
    mimeType: '',
    content: `content-${id}`,
    status: 'ready',
    chunkCount: 1,
    lastIndexedAt: '2026-04-01T00:00:00Z',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('agent workspace helpers', () => {
  it('upserts a knowledge document in place when it already exists', () => {
    expect(
      upsertKnowledgeDocument(
        [createDocument(7), createDocument(8)],
        createDocument(8, 11, { title: 'Updated title' }),
      ),
    ).toEqual([
      createDocument(7),
      createDocument(8, 11, { title: 'Updated title' }),
    ])
  })

  it('prepends uploaded documents ahead of existing documents in the same space', () => {
    expect(
      prependKnowledgeDocuments(
        [createDocument(7), createDocument(8)],
        [createDocument(9), createDocument(10)],
      ).map((document) => document.id),
    ).toEqual([9, 10, 7, 8])
  })

  it('removes a single document from the cached space documents', () => {
    expect(
      removeKnowledgeDocument(
        [createDocument(7), createDocument(8)],
        7,
      ).map((document) => document.id),
    ).toEqual([8])
  })

  it('clears cached documents for a deleted knowledge space', () => {
    expect(
      clearKnowledgeSpaceDocuments(
        {
          11: [createDocument(7, 11)],
          12: [createDocument(9, 12)],
        },
        11,
      ),
    ).toEqual({
      12: [createDocument(9, 12)],
    })
  })

  it('prefers the provider error when both workspace requests fail', () => {
    expect(
      resolveWorkspaceLoadError({
        providersResult: {
          status: 'rejected',
          reason: new Error('provider unavailable'),
        },
        spacesResult: {
          status: 'rejected',
          reason: new Error('spaces unavailable'),
        },
        fallbackMessage: 'load failed',
      }),
    ).toBe('provider unavailable')
  })
})
