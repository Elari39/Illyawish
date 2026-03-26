import type { ComponentProps } from 'react'

import { cn } from '../../../lib/utils'
import { SidebarContent } from './sidebar-content'

type MobileSidebarProps = Omit<ComponentProps<typeof SidebarContent>, 'collapsed'> & {
  isOpen: boolean
  onClose: () => void
}

export function MobileSidebar({
  isOpen,
  onClose,
  ...props
}: MobileSidebarProps) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-30 bg-black/25 opacity-0 transition md:hidden',
        isOpen && 'pointer-events-auto opacity-100',
      )}
    >
      <button
        className="absolute inset-0 h-full w-full"
        onClick={onClose}
        type="button"
      />
      <div
        className={cn(
          'absolute inset-y-0 left-0 w-[88vw] max-w-[320px] -translate-x-full bg-[var(--sidebar-bg)] shadow-xl transition-transform duration-200',
          isOpen && 'translate-x-0',
        )}
      >
        <SidebarContent collapsed={false} {...props} />
      </div>
    </div>
  )
}
