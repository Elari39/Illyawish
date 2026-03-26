import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { I18nProvider } from '../i18n/provider'

export function TestProviders({
  children,
  initialEntries,
}: {
  children: ReactNode
  initialEntries?: string[]
}) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <I18nProvider>{children}</I18nProvider>
    </MemoryRouter>
  )
}
