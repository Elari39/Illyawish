import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Database, GitBranch, SlidersHorizontal } from 'lucide-react'

import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { KnowledgeSpace, WorkflowPreset } from '../../../types/chat'

interface ChatToolMenuTriggerProps {
  knowledgeSpaceIds: number[]
  workflowPresetId: number | null
  workflowPresets: WorkflowPreset[]
  knowledgeSpaces: KnowledgeSpace[]
  isDisabled?: boolean
  onOpenKnowledgeSettings: () => void
  onOpenWorkflowSettings: () => void
}

export function ChatToolMenuTrigger({
  knowledgeSpaceIds,
  workflowPresetId,
  workflowPresets,
  knowledgeSpaces,
  isDisabled = false,
  onOpenKnowledgeSettings,
  onOpenWorkflowSettings,
}: ChatToolMenuTriggerProps) {
  const { t } = useI18n()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const selectedKnowledgeSpaces = useMemo(
    () => knowledgeSpaces.filter((space) => knowledgeSpaceIds.includes(space.id)),
    [knowledgeSpaceIds, knowledgeSpaces],
  )
  const selectedWorkflowPreset = useMemo(
    () => workflowPresets.find((preset) => preset.id === workflowPresetId) ?? null,
    [workflowPresetId, workflowPresets],
  )

  const knowledgeSummary =
    selectedKnowledgeSpaces.length > 0
      ? t('chatContext.knowledgeEnabled', { count: selectedKnowledgeSpaces.length })
      : t('chatContext.knowledgeDisabled')
  const workflowSummary =
    selectedWorkflowPreset != null
      ? t('chatContext.workflowEnabled', { name: selectedWorkflowPreset.name })
      : t('chatContext.workflowDisabled')
  const hasActiveTools = selectedKnowledgeSpaces.length > 0 || selectedWorkflowPreset != null

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (rootRef.current?.contains(target)) {
        return
      }

      setIsOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      triggerRef.current?.focus()
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function handleOpenKnowledge() {
    setIsOpen(false)
    onOpenKnowledgeSettings()
  }

  function handleOpenWorkflow() {
    setIsOpen(false)
    onOpenWorkflowSettings()
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          'relative inline-flex h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--brand)]/25 hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-60',
          hasActiveTools && 'border-[var(--brand)]/20 bg-[var(--brand)]/[0.06]',
        )}
        disabled={isDisabled}
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <SlidersHorizontal className="h-4 w-4 text-[var(--muted-foreground)]" />
        <span>{t('chat.toolsTrigger')}</span>
        {hasActiveTools ? (
          <span
            aria-hidden="true"
            className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[var(--brand)] ring-2 ring-[var(--surface)]"
            data-testid="chat-tools-active-indicator"
          />
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="absolute bottom-full left-0 z-20 mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-[var(--shadow-lg)]"
          id={menuId}
          role="menu"
        >
          <button
            className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30"
            onClick={handleOpenKnowledge}
            role="menuitem"
            type="button"
          >
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-bg)] text-[var(--muted-foreground)]">
              <Database className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--foreground)]">
                {t('settings.knowledgeTab')}
              </span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                {knowledgeSummary}
              </span>
            </span>
          </button>

          <button
            className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30"
            onClick={handleOpenWorkflow}
            role="menuitem"
            type="button"
          >
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-bg)] text-[var(--muted-foreground)]">
              <GitBranch className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--foreground)]">
                {t('settings.workflowTab')}
              </span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                {workflowSummary}
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
