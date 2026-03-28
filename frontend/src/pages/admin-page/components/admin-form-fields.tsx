import type { ReactNode } from 'react'

import { Input } from '../../../components/ui/input'
import { Select } from '../../../components/ui/select'

export function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  compact = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  compact?: boolean
}) {
  return (
    <label className="block space-y-2">
      <span className={compact ? 'text-xs font-medium text-[var(--muted-foreground)]' : 'text-sm font-medium'}>
        {label}
      </span>
      <Input
        className={compact ? 'px-3 py-2.5 text-sm' : undefined}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function LabeledSelect({
  label,
  value,
  onChange,
  children,
  compact = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  compact?: boolean
}) {
  return (
    <label className="block space-y-2">
      <span className={compact ? 'text-xs font-medium text-[var(--muted-foreground)]' : 'text-sm font-medium'}>
        {label}
      </span>
      <Select
        className={compact ? 'px-3 py-2.5 text-sm' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </Select>
    </label>
  )
}
