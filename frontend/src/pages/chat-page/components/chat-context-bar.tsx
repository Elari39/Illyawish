import { Cpu, Database, GitBranch, Sparkles } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Select } from '../../../components/ui/select'
import { useI18n } from '../../../i18n/use-i18n'
import type {
  ChatSettings,
  ConversationSettings,
  KnowledgeSpace,
  ProviderState,
  WorkflowPreset,
} from '../../../types/chat'
import {
  buildProviderModelOptions,
  resolveEffectiveProviderModel,
} from '../provider-model-utils'

interface ChatContextBarProps {
  chatSettings: ChatSettings
  settings: ConversationSettings
  providerState: ProviderState | null
  knowledgeSpaceIds: number[]
  workflowPresetId: number | null
  workflowPresets: WorkflowPreset[]
  knowledgeSpaces: KnowledgeSpace[]
  compact?: boolean
  compactVariant?: 'all' | 'model' | 'secondary'
  isDisabled?: boolean
  onOpenKnowledgeSettings: () => void
  onOpenWorkflowSettings: () => void
  onProviderModelChange: (value: string) => void
  onSetAsDefault: () => void
}

export function ChatContextBar({
  chatSettings,
  settings,
  providerState,
  knowledgeSpaceIds,
  workflowPresetId,
  workflowPresets,
  knowledgeSpaces,
  compact = false,
  compactVariant = 'all',
  isDisabled = false,
  onOpenKnowledgeSettings,
  onOpenWorkflowSettings,
  onProviderModelChange,
  onSetAsDefault,
}: ChatContextBarProps) {
  const { t } = useI18n()
  const providerModelOptions = buildProviderModelOptions(providerState)
  const currentSelection = resolveEffectiveProviderModel(
    providerState,
    settings,
    chatSettings,
  )
  const globalSelection = resolveEffectiveProviderModel(
    providerState,
    {
      providerPresetId: null,
      model: '',
    },
    chatSettings,
  )
  const selectedWorkflowPreset =
    workflowPresets.find((preset) => preset.id === workflowPresetId) ?? null
  const selectedKnowledgeSpaces = knowledgeSpaces.filter((space) =>
    knowledgeSpaceIds.includes(space.id),
  )
  const canSetAsDefault =
    currentSelection.providerPresetId != null &&
    currentSelection.model !== '' &&
    (currentSelection.providerPresetId !== globalSelection.providerPresetId ||
      currentSelection.model !== globalSelection.model)

  if (compact) {
    const showModelControl = compactVariant === 'all' || compactVariant === 'model'
    const showSecondaryControls =
      compactVariant === 'all' || compactVariant === 'secondary'
    const knowledgeEnabled = selectedKnowledgeSpaces.length > 0
    const workflowEnabled = selectedWorkflowPreset != null
    const modelLabel = currentSelection.preset && currentSelection.model
      ? `${currentSelection.preset.name} · ${currentSelection.model}`
      : t('chatContext.noProviderOptions')
    const knowledgeLabel = knowledgeEnabled
      ? t('chatContext.knowledgeEnabled', { count: selectedKnowledgeSpaces.length })
      : t('chatContext.knowledgeDisabled')
    const workflowLabel = workflowEnabled
      ? t('chatContext.workflowEnabled', { name: selectedWorkflowPreset.name })
      : t('chatContext.workflowDisabled')

    return (
      <div className="flex items-center gap-0.5">
        {showModelControl ? (
          <label className="relative block min-w-[132px] max-w-[180px]" title={modelLabel}>
            <Cpu className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Select
              aria-label={t('chatContext.providerModelLabel')}
              className="h-8 rounded-full border-none bg-[var(--app-bg)] py-1 pl-9 pr-8 text-xs shadow-none"
              disabled={isDisabled || providerModelOptions.length === 0}
              value={currentSelection.value}
              onChange={(event) => onProviderModelChange(event.target.value)}
            >
              {providerModelOptions.length === 0 ? (
                <option value="">{t('chatContext.noProviderOptions')}</option>
              ) : null}
              {providerModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        {showSecondaryControls ? (
          <>
            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[var(--hover-bg)] ${knowledgeEnabled ? 'text-[var(--brand)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
              disabled={isDisabled}
              onClick={onOpenKnowledgeSettings}
              title={knowledgeLabel}
              type="button"
              aria-label={knowledgeLabel}
            >
              <Database className="h-4 w-4" />
            </button>

            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[var(--hover-bg)] ${workflowEnabled ? 'text-[var(--brand)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
              disabled={isDisabled}
              onClick={onOpenWorkflowSettings}
              title={workflowLabel}
              type="button"
              aria-label={workflowLabel}
            >
              <GitBranch className="h-4 w-4" />
            </button>

            {canSetAsDefault ? (
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--brand)] transition hover:bg-[var(--hover-bg)]"
                disabled={isDisabled}
                onClick={onSetAsDefault}
                title={t('chatContext.setAsDefault')}
                type="button"
                aria-label={t('chatContext.setAsDefault')}
              >
                <Sparkles className="h-4 w-4" />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    )
  }

  return (
    <section className="border-b border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 lg:flex lg:flex-1 lg:flex-wrap lg:items-center">
          <label className="grid gap-2 lg:min-w-[280px]">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {t('chatContext.providerModelLabel')}
            </span>
            <Select
              aria-label={t('chatContext.providerModelLabel')}
              disabled={isDisabled || providerModelOptions.length === 0}
              value={currentSelection.value}
              onChange={(event) => onProviderModelChange(event.target.value)}
            >
              {providerModelOptions.length === 0 ? (
                <option value="">{t('chatContext.noProviderOptions')}</option>
              ) : null}
              {providerModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <StatusChip
            icon={Database}
            label={
              selectedKnowledgeSpaces.length > 0
                ? t('chatContext.knowledgeEnabled', {
                    count: selectedKnowledgeSpaces.length,
                  })
                : t('chatContext.knowledgeDisabled')
            }
            onClick={onOpenKnowledgeSettings}
          />

          <StatusChip
            icon={GitBranch}
            label={
              selectedWorkflowPreset
                ? t('chatContext.workflowEnabled', {
                    name: selectedWorkflowPreset.name,
                  })
                : t('chatContext.workflowDisabled')
            }
            onClick={onOpenWorkflowSettings}
          />
        </div>

        {canSetAsDefault ? (
          <Button
            className="shrink-0"
            disabled={isDisabled}
            onClick={onSetAsDefault}
            type="button"
            variant="secondary"
          >
            <Sparkles className="h-4 w-4" />
            {t('chatContext.setAsDefault')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function StatusChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Database
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--brand)]/30 hover:bg-[var(--surface-strong)]"
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
      <span>{label}</span>
    </button>
  )
}
