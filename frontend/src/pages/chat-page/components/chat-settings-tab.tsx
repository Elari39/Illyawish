import type { Dispatch, SetStateAction } from 'react'

import { Input } from '../../../components/ui/input'
import { Select } from '../../../components/ui/select'
import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'
import type { ConversationSettings } from '../../../types/chat'

interface ChatSettingsTabProps {
  modelOptions: string[]
  settings: ConversationSettings
  setSettings: Dispatch<SetStateAction<ConversationSettings>>
}

export function ChatSettingsTab({
  modelOptions,
  settings,
  setSettings,
}: ChatSettingsTabProps) {
  const { t } = useI18n()
  const hasModelOptions = modelOptions.length > 0

  return (
    <div className="mt-6 grid gap-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {t('settings.model')}
        </span>
        {hasModelOptions ? (
          <Select
            value={settings.model}
            onChange={(event) =>
              setSettings((previous) => ({
                ...previous,
                model: event.target.value,
              }))
            }
          >
            <option value="">{t('settings.modelDefaultOption')}</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            placeholder={t('settings.modelPlaceholder')}
            value={settings.model}
            onChange={(event) =>
              setSettings((previous) => ({
                ...previous,
                model: event.target.value,
              }))
            }
          />
        )}
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {t('settings.systemPrompt')}
        </span>
        <Textarea
          className="min-h-[160px] rounded-xl border border-[var(--line)] bg-white px-4 py-3"
          value={settings.systemPrompt}
          onChange={(event) =>
            setSettings((previous) => ({
              ...previous,
              systemPrompt: event.target.value,
            }))
          }
        />
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
            value={settings.temperature ?? ''}
            onChange={(event) =>
              setSettings((previous) => ({
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
            value={settings.maxTokens ?? ''}
            onChange={(event) =>
              setSettings((previous) => ({
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
    </div>
  )
}
