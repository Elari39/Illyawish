import type { TranslationKey, TranslationValues } from '../../../i18n/messages'

const stepLabelKeys: Record<string, TranslationKey> = {
  question: 'executionPanel.step.question',
  retrieve_knowledge: 'executionPanel.step.retrieve_knowledge',
  compose_answer: 'executionPanel.step.compose_answer',
  finalize: 'executionPanel.step.finalize',
}

const templateLabelKeys: Record<string, TranslationKey> = {
  knowledge_qa: 'executionPanel.template.knowledge_qa',
  webpage_digest: 'executionPanel.template.webpage_digest',
  document_summary: 'executionPanel.template.document_summary',
  multi_document_compare: 'executionPanel.template.multi_document_compare',
  structured_extraction: 'executionPanel.template.structured_extraction',
}

export function stepLabelKey(stepName: string) {
  return stepLabelKeys[stepName]
}

export function templateLabelKey(templateKey: string) {
  return templateLabelKeys[templateKey]
}

type TranslateFn = (key: TranslationKey, values?: TranslationValues) => string

export function localizeExecutionStepName(t: TranslateFn, stepName: string) {
  const key = stepLabelKey(stepName)
  return key ? t(key) : stepName
}

export function localizeExecutionTemplateKey(t: TranslateFn, templateKey: string) {
  const key = templateLabelKey(templateKey)
  return key ? t(key) : templateKey
}

export function localizeExecutionToolName(t: TranslateFn, toolName: string) {
  if (toolName === 'http_request') {
    return t('executionPanel.tool.http_request')
  }
  if (toolName === 'fetch_url') {
    return t('executionPanel.tool.fetch_url')
  }
  if (toolName === 'knowledge_search') {
    return t('executionPanel.tool.knowledge_search')
  }
  if (toolName === 'text_transform') {
    return t('executionPanel.tool.text_transform')
  }
  return toolName
}

export function localizeExecutionEventLabel(t: TranslateFn, type: string) {
  const keys: Record<string, TranslationKey> = {
    run_started: 'executionPanel.event.run_started',
    workflow_step_started: 'executionPanel.event.workflow_step_started',
    workflow_step_completed: 'executionPanel.event.workflow_step_completed',
    retrieval_started: 'executionPanel.event.retrieval_started',
    retrieval_completed: 'executionPanel.event.retrieval_completed',
    tool_call_started: 'executionPanel.event.tool_call_started',
    tool_call_confirmation_required: 'executionPanel.event.tool_call_confirmation_required',
    tool_call_completed: 'executionPanel.event.tool_call_completed',
    done: 'executionPanel.event.done',
    cancelled: 'executionPanel.event.cancelled',
    error: 'executionPanel.event.error',
  }

  return t(keys[type] ?? 'executionPanel.title')
}
