import type { FocusEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { Conversation } from '../../../types/chat'

interface UseSidebarActionMenuOptions {
  collapsed: boolean
  variant: 'desktop' | 'mobile'
  conversations: Conversation[]
}

export function useSidebarActionMenu({
  collapsed,
  variant,
  conversations,
}: UseSidebarActionMenuOptions) {
  const [expandedConversationId, setExpandedConversationId] = useState<number | null>(null)
  const [desktopMenuDirection, setDesktopMenuDirection] = useState<'up' | 'down'>('down')
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const desktopMenuRef = useRef<HTMLDivElement | null>(null)
  const desktopTriggerRefs = useRef(new Map<number, HTMLButtonElement | null>())
  const isMobileVariant = variant === 'mobile' && !collapsed
  const isDesktopVariant = variant === 'desktop' && !collapsed
  const effectiveExpandedConversationId =
    !collapsed &&
    conversations.some((conversation) => conversation.id === expandedConversationId)
      ? expandedConversationId
      : null

  useEffect(() => {
    if (!isDesktopVariant || effectiveExpandedConversationId == null) {
      return
    }

    const expandedConversationIdForEffect = effectiveExpandedConversationId

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      const menu = desktopMenuRef.current
      const trigger = desktopTriggerRefs.current.get(expandedConversationIdForEffect)

      if (!(target instanceof Node)) {
        return
      }

      if (menu?.contains(target) || trigger?.contains(target)) {
        return
      }

      setExpandedConversationId(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        desktopTriggerRefs.current.get(expandedConversationIdForEffect)?.focus()
        setExpandedConversationId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [effectiveExpandedConversationId, isDesktopVariant])

  function updateDesktopMenuDirection(conversationId: number) {
    const scrollContainer = scrollContainerRef.current
    const menu = desktopMenuRef.current
    const trigger = desktopTriggerRefs.current.get(conversationId)

    if (scrollContainer == null || menu == null || trigger == null) {
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const spaceBelow = containerRect.bottom - triggerRect.bottom
    const spaceAbove = triggerRect.top - containerRect.top

    setDesktopMenuDirection(
      spaceBelow < menuRect.height && spaceAbove > spaceBelow ? 'up' : 'down',
    )
  }

  function registerDesktopTrigger(
    conversationId: number,
    node: HTMLButtonElement | null,
  ) {
    if (node == null) {
      desktopTriggerRefs.current.delete(conversationId)
      return
    }

    desktopTriggerRefs.current.set(conversationId, node)
  }

  function handleDesktopMenuBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocused = event.relatedTarget

    if (!(nextFocused instanceof Node)) {
      setExpandedConversationId(null)
      return
    }

    const menu = desktopMenuRef.current
    const trigger =
      effectiveExpandedConversationId == null
        ? null
        : desktopTriggerRefs.current.get(effectiveExpandedConversationId)

    if (menu?.contains(nextFocused) || trigger?.contains(nextFocused)) {
      return
    }

    setExpandedConversationId(null)
  }

  function handleToggleConversationActions(
    conversationId: number,
    anchor?: HTMLButtonElement,
  ) {
    if (isDesktopVariant && anchor != null) {
      const nextConversationId =
        expandedConversationId === conversationId ? null : conversationId

      registerDesktopTrigger(conversationId, anchor)

      if (nextConversationId == null) {
        setExpandedConversationId(null)
        return
      }

      setDesktopMenuDirection('down')
      flushSync(() => {
        setExpandedConversationId(nextConversationId)
      })
      updateDesktopMenuDirection(nextConversationId)
      return
    }

    setExpandedConversationId((currentId) => (
      currentId === conversationId ? null : conversationId
    ))
  }

  function closeExpandedActions() {
    setExpandedConversationId(null)
  }

  return {
    scrollContainerRef,
    desktopMenuRef,
    desktopMenuDirection,
    isMobileVariant,
    isDesktopVariant,
    effectiveExpandedConversationId,
    registerDesktopTrigger,
    handleDesktopMenuBlur,
    handleToggleConversationActions,
    closeExpandedActions,
  }
}
