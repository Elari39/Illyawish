package provider

import (
	"strings"

	"backend/internal/llm"
)

func normalizeProviderFormat(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", llm.ProviderFormatOpenAI:
		return llm.ProviderFormatOpenAI
	case llm.ProviderFormatAnthropic:
		return llm.ProviderFormatAnthropic
	case llm.ProviderFormatGemini:
		return llm.ProviderFormatGemini
	default:
		return ""
	}
}
