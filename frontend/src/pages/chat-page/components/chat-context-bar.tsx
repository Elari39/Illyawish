import { Cpu, Database, Sparkles } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Select } from '../../../components/ui/select'
import { useI18n } from '../../../i18n/use-i18n'
import type {
  ChatSettings,
  ConversationSettings,
  KnowledgeSpace,
  ProviderState,
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
  knowledgeSpaces: KnowledgeSpace[]
  compact?: boolean
  compactVariant?: 'all' | 'model' | 'secondary'
  isDisabled?: boolean
  onOpenKnowledgeSettings: () => void
  onProviderModelChange: (value: string) => void
  onSetAsDefault: () => void
}

export function ChatContextBar({
  chatSettings,
  settings,
  providerState,
  knowledgeSpaceIds,
  knowledgeSpaces,
  compact = false,
  compactVariant = 'model',
  isDisabled = false,
  onOpenKnowledgeSettings,
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
  const selectedKnowledgeSpaces = knowledgeSpaces.filter((space) =>
    knowledgeSpaceIds.includes(space.id),
  )
  const canSetAsDefault =
    currentSelection.providerPresetId != null &&
    currentSelection.model !== '' &&
    (currentSelection.providerPresetId !== globalSelection.providerPresetId ||
      currentSelection.model !== globalSelection.model)
  const selectedProviderModelOption =
    providerModelOptions.find((option) => option.value === currentSelection.value) ?? null

  if (compact) {
    const showModelControl = compactVariant === 'all' || compactVariant === 'model'
    const modelLabel =
      (selectedProviderModelOption?.label ?? currentSelection.model) ||
      t('chatContext.noProviderOptions')

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
