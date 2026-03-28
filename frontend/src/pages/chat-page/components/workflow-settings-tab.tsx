import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import type { WorkflowPreset, WorkflowTemplate } from '../../../types/chat'

interface WorkflowSettingsTabProps {
  workflowPresets: WorkflowPreset[]
  workflowTemplates: WorkflowTemplate[]
  selectedWorkflowPresetId: number | null
  setSelectedWorkflowPresetId: React.Dispatch<React.SetStateAction<number | null>>
  createWorkflowPreset: (payload: {
    name: string
    templateKey: string
    defaultInputs?: Record<string, unknown>
    knowledgeSpaceIds?: number[]
    toolEnablements?: Record<string, boolean>
    outputMode?: string
  }) => Promise<WorkflowPreset | null>
  updateWorkflowPreset: (presetId: number, payload: {
    name?: string
    templateKey?: string
    defaultInputs?: Record<string, unknown>
    knowledgeSpaceIds?: number[]
    toolEnablements?: Record<string, boolean>
    outputMode?: string
  }) => Promise<WorkflowPreset | null>
  deleteWorkflowPreset: (presetId: number) => Promise<boolean>
}

export function WorkflowSettingsTab({
  workflowPresets,
  workflowTemplates,
  selectedWorkflowPresetId,
  setSelectedWorkflowPresetId,
  createWorkflowPreset,
  updateWorkflowPreset,
  deleteWorkflowPreset,
}: WorkflowSettingsTabProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [templateKey, setTemplateKey] = useState<string>(workflowTemplates[0]?.key ?? '')
  const [editingPresetId, setEditingPresetId] = useState<number | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const selectedPreset = useMemo(
    () => workflowPresets.find((preset) => preset.id === selectedWorkflowPresetId) ?? null,
    [selectedWorkflowPresetId, workflowPresets],
  )
  const effectiveTemplateKey = templateKey || workflowTemplates[0]?.key || ''

  function resetForm() {
    setEditingPresetId(null)
    setName('')
    setNameError(null)
    setTemplateKey('')
  }

  function beginEditingPreset(preset: WorkflowPreset) {
    setEditingPresetId(preset.id)
    setName(preset.name)
    setNameError(null)
    setTemplateKey(preset.templateKey)
  }

  async function handleSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError(t('workflow.validationPresetNameRequired'))
      return
    }

    setNameError(null)

    if (editingPresetId != null) {
      const updated = await updateWorkflowPreset(editingPresetId, {
        name: trimmedName,
        templateKey: effectiveTemplateKey,
        outputMode: 'markdown',
      })
      if (updated) {
        setSelectedWorkflowPresetId(updated.id)
        setName(updated.name)
        setTemplateKey(updated.templateKey)
      }
      return
    }

    const created = await createWorkflowPreset({
      name: trimmedName,
      templateKey: effectiveTemplateKey,
      outputMode: 'markdown',
    })
    if (created) {
      setSelectedWorkflowPresetId(created.id)
      resetForm()
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('workflow.presetsTitle')}</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              {t('workflow.presetsDescription')}
            </p>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('workflow.templateLabel')}</span>
            <select
              aria-label={t('workflow.templateLabel')}
              className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-4"
              value={selectedWorkflowPresetId ?? ''}
              onChange={(event) =>
                setSelectedWorkflowPresetId(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">{t('workflow.noPresetOption')}</option>
              {workflowPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} · {preset.templateKey}
                </option>
              ))}
            </select>
          </label>

          {selectedPreset ? (
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              {t('workflow.selectedPresetSummary', {
                name: selectedPreset.name,
                template: selectedPreset.templateKey,
              })}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('workflow.savedPresetsTitle')}</h3>
              <p className="text-xs text-[var(--muted-foreground)]">{t('workflow.savedPresetsDescription')}</p>
            </div>
            <button
              aria-label={t('workflow.newPreset')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
              onClick={resetForm}
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {workflowPresets.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--app-bg)]/50 px-4 py-5 text-sm text-[var(--muted-foreground)]">
              {t('workflow.noSavedPresets')}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {workflowPresets.map((preset) => {
                const isEditing = preset.id === editingPresetId
                const isSelected = preset.id === selectedWorkflowPresetId
                return (
                  <div
                    className={[
                      'rounded-2xl border px-4 py-4 transition',
                      isEditing || isSelected
                        ? 'border-[var(--brand)]/40 bg-[var(--brand)]/[0.04]'
                        : 'border-[var(--line)] bg-[var(--app-bg)]/45',
                    ].join(' ')}
                    key={preset.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">{preset.name}</p>
                        <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{preset.templateKey}</p>
                      </div>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)]/[0.08] px-2.5 py-1 text-xs font-medium text-[var(--brand-strong)]">
                          <Check className="h-3.5 w-3.5" />
                          {t('workflow.selectedPresetBadge')}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        aria-label={t('workflow.editPresetAction', { name: preset.name })}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-black/[0.04]"
                        onClick={() => beginEditingPreset(preset)}
                        type="button"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t('common.edit')}
                      </button>
                      <button
                        aria-label={t('workflow.deletePresetAction', { name: preset.name })}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger)]/5"
                        onClick={() => {
                          void deleteWorkflowPreset(preset.id)
                        }}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-[var(--line)] bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              {editingPresetId != null ? t('workflow.editPresetTitle') : t('workflow.createPresetTitle')}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t('workflow.formDescription')}</p>
          </div>
          {editingPresetId != null ? (
            <Button onClick={resetForm} type="button" variant="ghost">
              {t('workflow.newPreset')}
            </Button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('workflow.presetName')}</span>
            <Input
              aria-label={t('workflow.presetName')}
              placeholder={t('workflow.presetNamePlaceholder')}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (nameError) {
                  setNameError(null)
                }
              }}
            />
            {nameError ? <p className="text-xs text-[var(--danger)]">{nameError}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">{t('workflow.templateOptionLabel')}</span>
            <select
              aria-label={t('workflow.templateOptionLabel')}
              className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-4"
              value={effectiveTemplateKey}
              onChange={(event) => setTemplateKey(event.target.value)}
            >
              {workflowTemplates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleSubmit()} type="button">
              {editingPresetId != null ? t('workflow.savePreset') : t('workflow.createPreset')}
            </Button>
            {editingPresetId != null ? (
              <Button onClick={resetForm} type="button" variant="secondary">
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
