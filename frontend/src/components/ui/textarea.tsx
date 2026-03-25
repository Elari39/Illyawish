import type { TextareaHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none border-none bg-transparent px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]',
        className,
      )}
      {...props}
    />
  )
}
