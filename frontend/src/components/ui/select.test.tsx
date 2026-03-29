import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Select } from './select'

describe('Select', () => {
  it('applies explicit theme and disabled-state classes', () => {
    render(
      <Select aria-label="Model" disabled>
        <option value="model-a">Model A</option>
      </Select>,
    )

    const select = screen.getByRole('combobox', { name: 'Model' })
    expect(select.className).toContain('text-[var(--foreground)]')
    expect(select.className).toContain('disabled:cursor-not-allowed')
    expect(select.className).toContain('disabled:text-[var(--muted-foreground)]')
    expect(select.className).toContain('disabled:bg-[var(--surface)]')
  })
})
