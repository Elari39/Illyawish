import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useI18n } from '../../i18n/use-i18n'
import { CodeBlock } from './code-block'

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

function containsCodeFence(content: string) {
  return /(^|\n)(```|~~~)/.test(content)
}

function shouldRenderAsPlainText(content: string) {
  if (content.trim() === '') {
    return true
  }

  return !/(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|.+\||```|~~~)|!\[|\[[^\]]+\]\([^)]+\)|`[^`]+`|https?:\/\/|\*\*[^*]+\*\*|_[^_]+_|\n---/.test(content)
}
