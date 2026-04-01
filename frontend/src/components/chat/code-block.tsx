import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useI18n } from '../../i18n/use-i18n'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { useCodeBlockScroll } from './use-code-block-scroll'

interface CodeBlockProps {
  children: ReactNode
}

export function CodeBlock({ children }: CodeBlockProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [isWrapped, setIsWrapped] = useState(false)
  const resetCopiedTimerRef = useRef<number | null>(null)
  const codeElement = findCodeElement(children)
  const codeClassName = codeElement?.props.className
  const codeChildren = codeElement?.props.children ?? children
  const code = extractTextContent(codeChildren).replace(/\n$/, '')
  const language = getLanguageLabel(codeClassName) || t('message.code')
  const {
    viewportRef,
    isOverflowing,
    canScrollLeft,
    canScrollRight,
    isDragging,
    handleScroll,
    handleMouseDown,
  } = useCodeBlockScroll({
    contentKey: code,
    disabled: isWrapped,
  })

  useEffect(() => {
    return () => {
      if (resetCopiedTimerRef.current != null) {
        window.clearTimeout(resetCopiedTimerRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    if (resetCopiedTimerRef.current != null) {
      window.clearTimeout(resetCopiedTimerRef.current)
    }
    resetCopiedTimerRef.current = window.setTimeout(() => {
      setCopied(false)
      resetCopiedTimerRef.current = null
    }, 1200)
  }

  return (
    <div
      className={cn(
        'markdown-code',
        isWrapped && 'is-wrapped',
        isOverflowing && 'is-overflowing',
        isDragging && 'is-dragging',
      )}
      data-testid="code-block"
    >
      <div className="markdown-code__header">
        <span className="markdown-code__label">{language}</span>
        <div className="markdown-code__actions">
          <Button
            aria-pressed={isWrapped}
            className="rounded-lg px-2 py-1 text-xs text-white/72 hover:bg-white/8 hover:text-white"
            onClick={() => setIsWrapped((previous) => !previous)}
            variant="ghost"
          >
            {isWrapped ? t('message.unwrapCode') : t('message.wrapCode')}
          </Button>
          <Button
            className="rounded-lg px-2 py-1 text-xs text-white/72 hover:bg-white/8 hover:text-white"
            onClick={() => void handleCopy()}
            variant="ghost"
          >
            {copied ? t('message.copied') : t('message.copy')}
          </Button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className={cn(
          'markdown-code__viewport',
          isWrapped && 'markdown-code__viewport--wrapped',
          isDragging && 'is-dragging',
        )}
        data-testid="code-block-viewport"
        onMouseDown={handleMouseDown}
        onScroll={handleScroll}
      >
        <span
          aria-hidden="true"
          className={cn(
            'markdown-code__edge markdown-code__edge--left',
            !isWrapped && canScrollLeft && 'is-visible',
          )}
          data-testid="code-block-left-edge"
        />
        <span
          aria-hidden="true"
          className={cn(
            'markdown-code__edge markdown-code__edge--right',
            !isWrapped && canScrollRight && 'is-visible',
          )}
          data-testid="code-block-right-edge"
        />
        <pre className="markdown-code__pre">
          <code className={codeClassName}>{codeChildren}</code>
        </pre>
      </div>
    </div>
  )
}

function findCodeElement(children: ReactNode) {
  const childArray = Children.toArray(children)
  const candidate = childArray.length === 1 ? childArray[0] : null

  if (candidate && isValidElement<{ className?: string; children?: ReactNode }>(candidate)) {
    return candidate
  }

  return null
}

function extractTextContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(extractTextContent).join('')
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractTextContent(node.props.children)
  }

  return ''
}

function getLanguageLabel(className?: string) {
  if (!className) {
    return ''
  }

  const match = className.match(/language-([\w-]+)/)
  return match?.[1] ?? ''
}
