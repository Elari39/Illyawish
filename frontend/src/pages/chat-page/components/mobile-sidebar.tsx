import type { ComponentProps } from 'react'
import { useEffect, useRef } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { SidebarContent } from './sidebar-content'

type MobileSidebarProps = Omit<ComponentProps<typeof SidebarContent>, 'collapsed' | 'variant'> & {
  isOpen: boolean
  onClose: () => void
}

export function MobileSidebar({
  isOpen,
  onClose,
  ...props
}: MobileSidebarProps) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    panelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        'pointer-events-none fixed inset-0 z-30 bg-black/25 opacity-0 transition md:hidden',
        isOpen && 'pointer-events-auto opacity-100',
      )}
    >
      <button
        aria-label={t('chat.closeSidebar')}
        className="absolute inset-0 h-full w-full"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label={t('chat.sidebarNavigation')}
        aria-modal="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[84vw] max-w-[300px] -translate-x-full bg-[var(--sidebar-bg)] shadow-xl transition-transform duration-200',
          isOpen && 'translate-x-0',
        )}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <SidebarContent
          key={isOpen ? 'mobile-sidebar-open' : 'mobile-sidebar-closed'}
          collapsed={false}
          variant="mobile"
          {...props}
        />
      </div>
    </div>
  )
}
