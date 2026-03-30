import { useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import type { CreateRAGProviderPayload, RAGProviderState } from '../../../types/chat'

interface RAGProviderSettingsTabProps {
  providerState: RAGProviderState | null
  createProvider: (payload: CreateRAGProviderPayload) => Promise<void>
  activateProvider: (providerId: number) => Promise<void>
}

const defaultProviderForm: CreateRAGProviderPayload = {
  name: 'SiliconFlow',
  baseURL: 'https://api.siliconflow.cn/v1',
  apiKey: '',
  embeddingModel: 'Qwen/Qwen3-Embedding-8B',
  rerankerModel: 'Qwen/Qwen3-Reranker-8B',
}

export function RAGProviderSettingsTab({
  providerState,
  createProvider,
  activateProvider,
}: RAGProviderSettingsTabProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<CreateRAGProviderPayload>(defaultProviderForm)

  return (
    <div className="mt-6 grid gap-5">
      <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('rag.activeProviderTitle')}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            {t('rag.activeProviderDescription')}
          </p>
        </div>

        {providerState?.presets.map((preset) => (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3" key={preset.id}>
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{preset.name}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {preset.embeddingModel} · {preset.rerankerModel} · {preset.apiKeyHint || t('rag.noKeyHint')}
              </p>
            </div>
            <Button
              onClick={() => void activateProvider(preset.id)}
              type="button"
              variant={preset.isActive ? 'secondary' : 'ghost'}
            >
              {preset.isActive ? t('rag.active') : t('rag.activate')}
            </Button>
          </div>
        ))}

        {providerState?.presets.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">{t('rag.noSavedPresets')}</p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('rag.createProviderTitle')}</h3>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('rag.providerName')}</span>
          <Input
            aria-label={t('rag.providerName')}
            placeholder={t('rag.providerNamePlaceholder')}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('rag.baseUrl')}</span>
          <Input
            aria-label={t('rag.baseUrl')}
            value={form.baseURL}
            onChange={(event) => setForm((prev) => ({ ...prev, baseURL: event.target.value }))}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('rag.apiKey')}</span>
          <Input
            aria-label={t('rag.apiKey')}
            value={form.apiKey}
            onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('rag.embeddingModel')}</span>
          <Input
            aria-label={t('rag.embeddingModel')}
            value={form.embeddingModel}
            onChange={(event) => setForm((prev) => ({ ...prev, embeddingModel: event.target.value }))}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--foreground)]">{t('rag.rerankerModel')}</span>
          <Input
            aria-label={t('rag.rerankerModel')}
            value={form.rerankerModel}
            onChange={(event) => setForm((prev) => ({ ...prev, rerankerModel: event.target.value }))}
          />
        </label>
        <Button onClick={() => void createProvider(form)} type="button">
          {t('rag.saveProvider')}
        </Button>
      </div>
    </div>
  )
}
