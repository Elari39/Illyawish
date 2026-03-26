import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { Conversation } from '../../../types/chat'
import { IMPORT_CONVERSATION_INPUT_ACCEPT } from '../types'

interface TransferSettingsTabProps {
  conversation: Conversation | null
  isImporting: boolean
  messageCount: number
  onExport: () => void
  onImport: (file: File) => void
}

export function TransferSettingsTab({
  conversation,
  isImporting,
  messageCount,
  onExport,
  onImport,
}: TransferSettingsTabProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const canExport = conversation != null && messageCount > 0

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white p-3 text-[var(--foreground)] shadow-sm">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              {t('settings.exportSectionTitle')}
            </h3>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
              {canExport
                ? t('settings.exportReadyDescription', {
                    title: conversation.title,
                  })
                : t('settings.exportEmptyDescription')}
            </p>
          </div>
        </div>

        <Button
          className="mt-5 w-full"
          disabled={!canExport}
          onClick={onExport}
          variant="secondary"
        >
          {t('chat.export')}
        </Button>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--app-bg)] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white p-3 text-[var(--foreground)] shadow-sm">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              {t('settings.importSectionTitle')}
            </h3>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
              {t('settings.importDescription')}
            </p>
          </div>
        </div>

        <Button
          className="mt-5 w-full"
          disabled={isImporting}
          onClick={() => inputRef.current?.click()}
          variant="secondary"
        >
          {isImporting ? t('settings.importingConversation') : t('settings.importConversation')}
        </Button>

        <input
          accept={IMPORT_CONVERSATION_INPUT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) {
              return
            }
            onImport(file)
          }}
          ref={inputRef}
          type="file"
        />
      </section>
    </div>
  )
}
