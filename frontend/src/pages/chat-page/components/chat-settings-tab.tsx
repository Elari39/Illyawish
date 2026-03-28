import type { Dispatch, SetStateAction } from 'react'

import { Input } from '../../../components/ui/input'
import { Select } from '../../../components/ui/select'
import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'
import type { ChatSettings, ConversationSettings, ProviderState } from '../../../types/chat'
import {
  findProviderPreset,
  resolveModelsForProvider,
} from '../provider-model-utils'

interface ChatSettingsTabProps {
  chatSettings: ChatSettings
  conversationFolder: string
  conversationTags: string
  providerState: ProviderState | null
  settings: ConversationSettings
  setConversationFolder: Dispatch<SetStateAction<string>>
  setConversationTags: Dispatch<SetStateAction<string>>
  setChatSettings: Dispatch<SetStateAction<ChatSettings>>
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
}

export function ChatSettingsTab({
  chatSettings,
  conversationFolder,
  conversationTags,
  providerState,
  settings,
  setConversationFolder,
  setConversationTags,
  setChatSettings,
  setSettings,
}: ChatSettingsTabProps) {
  const { t } = useI18n()
  const providerOptions = providerState?.presets ?? []
  const selectedProviderPreset = findProviderPreset(
    providerState,
    chatSettings.providerPresetId ?? providerState?.activePresetId ?? null,
  )
  const modelOptions = resolveModelsForProvider(
    providerState,
    selectedProviderPreset?.id ?? null,
    chatSettings.model,
  )
  const hasModelOptions = modelOptions.length > 0

  return (
    <div className="mt-6 grid gap-5">
      <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t('settings.globalModelSection')}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            {t('settings.globalModelSectionHelp')}
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('chatContext.providerLabel')}
          </span>
          <Select
            aria-label={t('chatContext.providerLabel')}
            value={chatSettings.providerPresetId ?? ''}
            onChange={(event) => {
              const nextProviderPresetId = event.target.value
                ? Number(event.target.value)
                : null
              const nextPreset = findProviderPreset(
                providerState,
                nextProviderPresetId,
              )

              setChatSettings((previous) => ({
                ...previous,
                providerPresetId: nextProviderPresetId,
                model: nextPreset?.defaultModel ?? previous.model,
              }))
            }}
          >
            {providerOptions.length === 0 ? (
              <option value="">{t('chatContext.noProviderOptions')}</option>
            ) : null}
            {providerOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('settings.model')}
          </span>
          {hasModelOptions ? (
            <Select
              value={chatSettings.model}
              onChange={(event) =>
                setChatSettings((previous) => ({
                  ...previous,
                  model: event.target.value,
                }))
              }
            >
              <option value="">
                {selectedProviderPreset
                  ? t('settings.modelDefaultOption')
                  : t('chatContext.selectProviderFirst')}
              </option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              placeholder={t('settings.modelPlaceholder')}
              value={chatSettings.model}
              onChange={(event) =>
                setChatSettings((previous) => ({
                  ...previous,
                  model: event.target.value,
                }))
              }
            />
          )}
        </label>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {t('settings.temperature')}
            </span>
            <Input
              min="0"
              max="2"
              step="0.1"
              type="number"
              value={chatSettings.temperature ?? ''}
              onChange={(event) =>
                setChatSettings((previous) => ({
                  ...previous,
                  temperature:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                }))
              }
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {t('settings.maxTokens')}
            </span>
            <Input
              min="0"
              step="1"
              type="number"
              value={chatSettings.maxTokens ?? ''}
              onChange={(event) =>
                setChatSettings((previous) => ({
                  ...previous,
                  maxTokens:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                }))
              }
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('settings.contextWindowTurns')}
          </span>
          <Input
            min="0"
            step="1"
            type="number"
            value={chatSettings.contextWindowTurns ?? ''}
            onChange={(event) =>
              setChatSettings((previous) => ({
                ...previous,
                contextWindowTurns:
                  event.target.value === ''
                    ? null
                    : Number(event.target.value),
              }))
            }
          />
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            {t('settings.contextWindowTurnsHelp')}
          </p>
        </label>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t('settings.promptSection')}
          </h3>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {t('settings.globalPrompt')}
          </span>
          <Textarea
            className="min-h-[160px] rounded-xl border border-[var(--line)] bg-white px-4 py-3"
            placeholder={t('settings.globalPromptPlaceholder')}
            value={chatSettings.globalPrompt}
            onChange={(event) =>
              setChatSettings((previous) => ({
                ...previous,
                globalPrompt: event.target.value,
              }))
            }
          />
        </label>

        <div className="space-y-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {t('settings.sessionPrompt')}
            </span>
            <Textarea
              aria-describedby="session-prompt-help"
              className="min-h-[160px] rounded-xl border border-[var(--line)] bg-white px-4 py-3"
              placeholder={t('settings.sessionPromptPlaceholder')}
              value={settings.systemPrompt}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  systemPrompt: event.target.value,
                }))
              }
            />
          </label>
          <p
            className="text-sm leading-6 text-[var(--muted-foreground)]"
            id="session-prompt-help"
          >
            {t('settings.sessionPromptHelp')}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {t('settings.folder')}
            </span>
            <Input
              placeholder={t('settings.folderPlaceholder')}
              value={conversationFolder}
              onChange={(event) => setConversationFolder(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {t('settings.tags')}
            </span>
            <Input
              placeholder={t('settings.tagsPlaceholder')}
              value={conversationTags}
              onChange={(event) => setConversationTags(event.target.value)}
            />
          </label>
        </div>
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">
          {t('settings.tagsHelp')}
        </p>
      </div>
    </div>
  )
}
