import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import { TestProviders } from '../../../test/test-providers'
import { createProviderFormErrors } from '../utils'
import { ProviderModelEditor } from './provider-model-editor'

function ProviderModelEditorHarness() {
  const [value, setValue] = useState({
    models: [''],
    defaultModel: '',
  })

  return (
    <ProviderModelEditor
      defaultModel={value.defaultModel}
      errors={createProviderFormErrors()}
      models={value.models}
      onChange={setValue}
    />
  )
}

describe('ProviderModelEditor', () => {
  it('keeps the same input focused while typing a model name', () => {
    render(
      <TestProviders>
        <ProviderModelEditorHarness />
      </TestProviders>,
    )

    const input = screen.getByPlaceholderText('gpt-4.1-mini')
    input.focus()

    fireEvent.change(input, {
      target: { value: 'gpt' },
    })

    const updatedInput = screen.getByRole('textbox')
    expect(updatedInput).toBe(input)
    expect(updatedInput).toBe(document.activeElement)

    fireEvent.change(updatedInput, {
      target: { value: 'gpt-4.1-mini' },
    })

    const finalInput = screen.getByRole('textbox')
    expect(finalInput).toBe(input)
    expect(finalInput).toBe(document.activeElement)
  })
})
