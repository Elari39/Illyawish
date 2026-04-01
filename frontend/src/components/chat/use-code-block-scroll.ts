import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'

interface UseCodeBlockScrollOptions {
  contentKey: string
  disabled: boolean
}

interface ScrollState {
  isOverflowing: boolean
  canScrollLeft: boolean
  canScrollRight: boolean
}

interface DragState {
  startClientX: number
  startScrollLeft: number
}

const bodyDraggingClassName = 'is-dragging-code-block'
const overflowTolerance = 1

export function useCodeBlockScroll({
  contentKey,
  disabled,
}: UseCodeBlockScrollOptions) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [scrollState, setScrollState] = useState<ScrollState>({
    isOverflowing: false,
    canScrollLeft: false,
    canScrollRight: false,
  })
  const [isDragging, setIsDragging] = useState(false)

  const updateScrollState = useCallback((viewport: HTMLDivElement | null) => {
    if (!viewport || disabled) {
      setScrollState({
        isOverflowing: false,
        canScrollLeft: false,
        canScrollRight: false,
      })
      return
    }

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const isOverflowing = maxScrollLeft > overflowTolerance

    setScrollState({
      isOverflowing,
      canScrollLeft: isOverflowing && viewport.scrollLeft > overflowTolerance,
      canScrollRight:
        isOverflowing && viewport.scrollLeft < maxScrollLeft - overflowTolerance,
    })
  }, [disabled])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    if (disabled) {
      viewport.scrollLeft = 0
      updateScrollState(viewport)
      return
    }

    updateScrollState(viewport)

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      updateScrollState(viewportRef.current)
    })

    observer.observe(viewport)

    return () => {
      observer.disconnect()
    }
  }, [contentKey, disabled, updateScrollState])

  useEffect(() => {
    if (!isDragging || disabled) {
      return
    }

    function handleMouseMove(event: MouseEvent) {
      const viewport = viewportRef.current
      const dragState = dragStateRef.current

      if (!viewport || !dragState) {
        return
      }

      const delta = event.clientX - dragState.startClientX
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      const nextScrollLeft = clamp(dragState.startScrollLeft - delta, 0, maxScrollLeft)

      viewport.scrollLeft = nextScrollLeft
      updateScrollState(viewport)
      event.preventDefault()
    }

    function stopDragging() {
      dragStateRef.current = null
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopDragging)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopDragging)
    }
  }, [disabled, isDragging, updateScrollState])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    document.body.classList.toggle(bodyDraggingClassName, isDragging)

    return () => {
      document.body.classList.remove(bodyDraggingClassName)
    }
  }, [isDragging])

  function handleScroll() {
    updateScrollState(viewportRef.current)
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || !scrollState.isOverflowing) {
      return
    }

    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    dragStateRef.current = {
      startClientX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
    }
    setIsDragging(true)
    event.preventDefault()
  }

  return {
    viewportRef,
    isOverflowing: scrollState.isOverflowing,
    canScrollLeft: scrollState.canScrollLeft,
    canScrollRight: scrollState.canScrollRight,
    isDragging,
    handleScroll,
    handleMouseDown,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
