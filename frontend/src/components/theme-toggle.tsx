import { Monitor, Moon, Sun } from 'lucide-react'

import type { Theme } from '../contexts/theme-context'
import { useTheme } from '../contexts/use-theme'
import { cn } from '../lib/utils'

const CYCLE: Theme[] = ['system', 'light', 'dark']

const ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()

  function handleClick() {
    const idx = CYCLE.indexOf(theme)
    setTheme(CYCLE[(idx + 1) % CYCLE.length])
  }

  const Icon = ICONS[theme]

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]',
        className,
      )}
      onClick={handleClick}
      title={`Theme: ${theme}`}
      type="button"
      aria-label={`Switch theme (current: ${theme})`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
