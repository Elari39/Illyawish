import { useLayoutEffect, useState, type RefObject } from 'react'

interface UseTextareaSizingOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  composerValue: string
  compactMinHeight: number
  isExpanded: boolean
  textareaMaxHeight: number
  onToggleExpanded?: (expanded: boolean) => void
}

export function useTextareaSizing({
  textareaRef,
  composerValue,
  compactMinHeight,
  isExpanded,
  textareaMaxHeight,
  onToggleExpanded,
}: UseTextareaSizingOptions) {
  const [isComposerOverflowing, setIsComposerOverflowing] = useState(false)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      if (isExpanded) {
        textarea.style.height = '100%'
        textarea.style.overflowY = 'auto'
        setIsComposerOverflowing(Boolean(onToggleExpanded))
        return
      }

      textarea.style.height = '0px'
      const nextScrollHeight = textarea.scrollHeight
      const nextHeight = Math.max(
        compactMinHeight,
        Math.min(nextScrollHeight, textareaMaxHeight),
      )

      textarea.style.height = `${nextHeight}px`
      textarea.style.overflowY =
        nextScrollHeight > textareaMaxHeight ? 'auto' : 'hidden'
      setIsComposerOverflowing(nextScrollHeight > textareaMaxHeight)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [
    compactMinHeight,
    composerValue,
    isExpanded,
    onToggleExpanded,
    textareaMaxHeight,
    textareaRef,
  ])

  return {
    isComposerOverflowing,
  }
}
