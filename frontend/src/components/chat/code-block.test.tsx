import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '../../i18n/provider'
import { CodeBlock } from './code-block'
import { MarkdownContent } from './markdown-content'

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []

  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  disconnect() {}

  observe() {}

  unobserve() {}

  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function installClipboardMock() {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
}

function installResizeObserverMock() {
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  })
}

function setViewportDimensions(
  element: HTMLElement,
  {
    clientWidth,
    scrollWidth,
    scrollLeft = 0,
  }: { clientWidth: number; scrollWidth: number; scrollLeft?: number },
) {
  let currentScrollLeft = scrollLeft

  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  })
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  })
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    get: () => currentScrollLeft,
    set: (value: number) => {
      currentScrollLeft = value
    },
  })
}

function triggerResizeObserver() {
  for (const observer of ResizeObserverMock.instances) {
    observer.trigger()
  }
}

describe('CodeBlock', () => {
  beforeEach(() => {
    ResizeObserverMock.instances = []
    installClipboardMock()
    installResizeObserverMock()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('toggles wrapped mode for only the selected code block', async () => {
    render(
      <I18nProvider>
        <MarkdownContent
          content={[
            '```ts',
            'const firstLine = "a very long line";',
            '```',
            '',
            '```ts',
            'const secondLine = "another very long line";',
            '```',
          ].join('\n')}
        />
      </I18nProvider>,
    )

    const blocks = screen.getAllByTestId('code-block')
    expect(blocks).toHaveLength(2)

    const firstBlock = blocks[0]!
    const secondBlock = blocks[1]!

    fireEvent.click(within(firstBlock).getByRole('button', { name: 'Wrap lines' }))

    expect(firstBlock).toHaveClass('is-wrapped')
    expect(secondBlock).not.toHaveClass('is-wrapped')
    expect(within(firstBlock).getByRole('button', { name: 'Unwrap lines' })).toBeInTheDocument()
    expect(within(secondBlock).getByRole('button', { name: 'Wrap lines' })).toBeInTheDocument()
  })

  it('updates overflow edge hints as the viewport scroll position changes', async () => {
    render(
      <I18nProvider>
        <CodeBlock>
          <code>{'const example = "overflow";'}</code>
        </CodeBlock>
      </I18nProvider>,
    )

    const block = screen.getByTestId('code-block')
    const viewport = screen.getByTestId('code-block-viewport')

    setViewportDimensions(viewport, { clientWidth: 240, scrollWidth: 640 })

    await act(async () => {
      triggerResizeObserver()
    })

    expect(block).toHaveClass('is-overflowing')
    expect(screen.getByTestId('code-block-left-edge')).not.toHaveClass('is-visible')
    expect(screen.getByTestId('code-block-right-edge')).toHaveClass('is-visible')

    viewport.scrollLeft = 120
    fireEvent.scroll(viewport)

    expect(screen.getByTestId('code-block-left-edge')).toHaveClass('is-visible')
    expect(screen.getByTestId('code-block-right-edge')).toHaveClass('is-visible')

    viewport.scrollLeft = 400
    fireEvent.scroll(viewport)

    expect(screen.getByTestId('code-block-left-edge')).toHaveClass('is-visible')
    expect(screen.getByTestId('code-block-right-edge')).not.toHaveClass('is-visible')
  })

  it('drags horizontally only while the code block stays unwrapped', async () => {
    render(
      <I18nProvider>
        <CodeBlock>
          <code>{'const draggable = "overflow";'}</code>
        </CodeBlock>
      </I18nProvider>,
    )

    const viewport = screen.getByTestId('code-block-viewport')

    setViewportDimensions(viewport, { clientWidth: 220, scrollWidth: 640 })

    await act(async () => {
      triggerResizeObserver()
    })

    fireEvent.mouseDown(viewport, { button: 0, clientX: 180 })
    fireEvent.mouseMove(window, { clientX: 120 })

    expect(viewport.scrollLeft).toBe(60)

    fireEvent.mouseUp(window)
    fireEvent.click(screen.getByRole('button', { name: 'Wrap lines' }))
    viewport.scrollLeft = 0

    fireEvent.mouseDown(viewport, { button: 0, clientX: 180 })
    fireEvent.mouseMove(window, { clientX: 120 })

    expect(viewport.scrollLeft).toBe(0)
  })
})
