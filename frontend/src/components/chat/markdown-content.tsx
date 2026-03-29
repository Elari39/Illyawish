import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useI18n } from '../../i18n/use-i18n'
import { Button } from '../ui/button'

interface MarkdownContentProps {
  content: string
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const { t } = useI18n()
  const resolvedContent = content || t('message.thinking')
  const renderAsPlainText = shouldRenderAsPlainText(resolvedContent)
  const [rehypePlugins, setRehypePlugins] = useState<unknown[]>([])

  useEffect(() => {
    let cancelled = false

    if (renderAsPlainText || !containsCodeFence(resolvedContent)) {
      setRehypePlugins([])
      return () => {
        cancelled = true
      }
    }

    void import('rehype-highlight').then((module) => {
      if (cancelled) {
        return
      }
      setRehypePlugins([[module.default, { detect: false, ignoreMissing: true }]])
    })

    return () => {
      cancelled = true
    }
  }, [renderAsPlainText, resolvedContent])

  if (renderAsPlainText) {
    return (
      <p
        className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--foreground)]"
        data-testid="plain-markdown-content"
      >
        {resolvedContent}
      </p>
    )
  }

  return (
    <div
      className="markdown mt-2 text-[var(--foreground)]"
      data-testid="rich-markdown-content"
    >
      <ReactMarkdown
        components={{
          a(props) {
            const { href, ...rest } = props
            return (
              <a
                href={href}
                rel="noreferrer"
                target="_blank"
                {...rest}
              />
            )
          },
          img(props) {
            const { alt, src, ...rest } = props
            return <img alt={alt || ''} loading="lazy" src={src} {...rest} />
          },
          pre(props) {
            return <CodeBlock>{props.children}</CodeBlock>
          },
          table(props) {
            return (
              <div className="markdown-table-wrap">
                <table>{props.children}</table>
              </div>
            )
          },
        }}
        rehypePlugins={rehypePlugins as never[]}
        remarkPlugins={[remarkGfm]}
      >
        {resolvedContent}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const resetCopiedTimerRef = useRef<number | null>(null)
  const codeElement = findCodeElement(children)
  const codeClassName = codeElement?.props.className
  const codeChildren = codeElement?.props.children ?? children
  const code = extractTextContent(codeChildren).replace(/\n$/, '')
  const language = getLanguageLabel(codeClassName) || t('message.code')

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
    <div className="markdown-code">
      <div className="markdown-code__header">
        <span className="markdown-code__label">{language}</span>
        <Button
          className="rounded-lg px-2 py-1 text-xs text-white/72 hover:bg-white/8 hover:text-white"
          onClick={() => void handleCopy()}
          variant="ghost"
        >
          {copied ? t('message.copied') : t('message.copy')}
        </Button>
      </div>
      <pre className="markdown-code__pre">
        <code className={codeClassName}>{codeChildren}</code>
      </pre>
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

function containsCodeFence(content: string) {
  return /(^|\n)(```|~~~)/.test(content)
}

function shouldRenderAsPlainText(content: string) {
  if (content.trim() === '') {
    return true
  }

  return !/(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|.+\||```|~~~)|!\[|\[[^\]]+\]\([^)]+\)|`[^`]+`|https?:\/\/|\*\*[^*]+\*\*|_[^_]+_|\n---/.test(content)
}
