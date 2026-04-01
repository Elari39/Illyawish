export interface ParsedOptionalNumberResult {
  isValid: boolean
  value: number | null
}

export interface ChatNumericInputDrafts {
  temperature: string
  maxTokens: string
  contextWindowTurns: string
}

export function parseOptionalPositiveInteger(value: string): ParsedOptionalNumberResult {
  const parsed = parseOptionalNonNegativeInteger(value)
  if (!parsed.isValid || parsed.value == null) {
    return parsed
  }

  return {
    isValid: parsed.value > 0,
    value: parsed.value > 0 ? parsed.value : null,
  }
}

export function parseRequiredPositiveInteger(value: string): ParsedOptionalNumberResult {
  if (value === '') {
    return { isValid: false, value: null }
  }

  return parseOptionalPositiveInteger(value)
}

export function parseOptionalNonNegativeInteger(value: string): ParsedOptionalNumberResult {
  if (value === '') {
    return { isValid: true, value: null }
  }
  if (!/^\d+$/.test(value)) {
    return { isValid: false, value: null }
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { isValid: false, value: null }
  }

  return { isValid: true, value: parsed }
}

export function parseOptionalFloatInRange(
  value: string,
  minimum: number,
  maximum: number,
): ParsedOptionalNumberResult {
  if (value === '') {
    return { isValid: true, value: null }
  }
  if (!/^(?:\d+|\d*\.\d+)$/.test(value)) {
    return { isValid: false, value: null }
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return { isValid: false, value: null }
  }

  return { isValid: true, value: parsed }
}

export function parseOptionalTemperature(value: string): ParsedOptionalNumberResult {
  return parseOptionalFloatInRange(value, 0, 2)
}

export function toChatNumericInputDrafts(settings: {
  temperature: number | null
  maxTokens: number | null
  contextWindowTurns: number | null
}): ChatNumericInputDrafts {
  return {
    temperature: settings.temperature == null ? '' : String(settings.temperature),
    maxTokens: settings.maxTokens == null ? '' : String(settings.maxTokens),
    contextWindowTurns:
      settings.contextWindowTurns == null ? '' : String(settings.contextWindowTurns),
  }
}
