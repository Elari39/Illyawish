import { Plus, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Select } from '../../../components/ui/select'
import { useI18n } from '../../../i18n/use-i18n'
import type { ProviderFormErrors } from '../types'
import {
  normalizeModelEntries,
  resolveDefaultModelValue,
} from '../utils'

interface ProviderModelEditorProps {
  defaultModel: string
  errors: ProviderFormErrors
  models: string[]
  onChange: (value: { models: string[]; defaultModel: string }) => void
  shouldFocusErrors?: boolean
}

export function ProviderModelEditor({
  defaultModel,
  errors,
  models,
  onChange,
  shouldFocusErrors = true,
}: ProviderModelEditorProps) {
  const { t } = useI18n()
  const modelInputRefs = useRef<Array<HTMLInputElement | null>>([])
  const defaultModelRef = useRef<HTMLSelectElement | null>(null)
  const normalizedModels = normalizeModelEntries(models)

  function updateModels(nextModels: string[], nextDefaultModel = defaultModel) {
    const safeModels = nextModels.length > 0 ? nextModels : ['']
    onChange({
      models: safeModels,
      defaultModel: resolveDefaultModelValue(safeModels, nextDefaultModel),
    })
  }

  useEffect(() => {
    if (!shouldFocusErrors) {
      return
    }

    const invalidModelIndex = errors.modelItems.findIndex((message) => Boolean(message))
    if (invalidModelIndex >= 0) {
      const targetInput = modelInputRefs.current[invalidModelIndex]
      targetInput?.focus()
      targetInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    if (errors.models) {
      const firstInput = modelInputRefs.current[0]
      firstInput?.focus()
      firstInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    if (errors.defaultModel) {
      defaultModelRef.current?.focus()
      defaultModelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [errors.defaultModel, errors.modelItems, errors.models, shouldFocusErrors])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('settings.modelList')}
          </span>
          <Button
            className="px-3 py-2"
            onClick={() => updateModels([...models, ''])}
            variant="ghost"
          >
            <Plus className="h-4 w-4" />
            {t('settings.addModel')}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {t('settings.modelListDescription')}
        </p>
      </div>

      <div className="space-y-3">
        {models.map((model, index) => (
          <div className="flex items-center gap-3" key={index}>
            <div className="flex-1 space-y-2">
              <Input
                placeholder="gpt-4.1-mini"
                ref={(element) => {
                  modelInputRefs.current[index] = element
                }}
                value={model}
                onChange={(event) => {
                  const nextModels = [...models]
                  nextModels[index] = event.target.value
                  updateModels(nextModels)
                }}
              />
              {errors.modelItems[index] ? (
                <p className="text-xs text-[var(--danger)]">
                  {errors.modelItems[index]}
                </p>
              ) : null}
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
              onClick={() => {
                const nextModels = models.filter((_, itemIndex) => itemIndex !== index)
                updateModels(nextModels)
              }}
              title={t('settings.removeModel')}
              type="button"
              aria-label={t('settings.removeModel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {errors.models ? (
        <p className="text-xs text-[var(--danger)]">
          {errors.models}
        </p>
      ) : null}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {t('settings.defaultModelLabel')}
        </span>
        <Select
          ref={defaultModelRef}
          disabled={normalizedModels.length === 0}
          value={resolveDefaultModelValue(models, defaultModel)}
          onChange={(event) =>
            onChange({
              models,
              defaultModel: event.target.value,
            })
          }
        >
          {normalizedModels.length === 0 ? (
            <option value="">{t('settings.defaultModelEmpty')}</option>
          ) : null}
          {normalizedModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </Select>
        {errors.defaultModel ? (
          <p className="text-xs text-[var(--danger)]">
            {errors.defaultModel}
          </p>
        ) : null}
      </label>
    </div>
  )
}
