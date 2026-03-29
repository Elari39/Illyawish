import {
  forwardRef,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '../../lib/utils'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({
  className,
  ...props
}, ref) {
  return (
    <textarea
      className={cn(
        'w-full resize-none border-none bg-transparent px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
