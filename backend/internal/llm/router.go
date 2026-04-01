package llm

import (
	"context"
	"fmt"
	"strings"
)

type RouterChatModel struct {
	openai    ChatModel
	anthropic ChatModel
	gemini    ChatModel
}

func (m *RouterChatModel) Stream(
	ctx context.Context,
	provider ProviderConfig,
	messages []ChatMessage,
	options RequestOptions,
	onDelta func(StreamDelta),
) (StreamResult, error) {
	target, err := m.modelForFormat(provider.Format)
	if err != nil {
		return StreamResult{}, err
	}
	provider.Format = normalizeProviderFormat(provider.Format)
	return target.Stream(ctx, provider, messages, options, onDelta)
}

func (m *RouterChatModel) modelForFormat(format string) (ChatModel, error) {
	switch normalizeProviderFormat(format) {
	case ProviderFormatOpenAI:
		return m.openai, nil
	case ProviderFormatAnthropic:
		return m.anthropic, nil
	case ProviderFormatGemini:
		return m.gemini, nil
	default:
		return nil, fmt.Errorf("unsupported provider format: %q", strings.TrimSpace(format))
	}
}

func normalizeProviderFormat(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", ProviderFormatOpenAI:
		return ProviderFormatOpenAI
	case ProviderFormatAnthropic:
		return ProviderFormatAnthropic
	case ProviderFormatGemini:
		return ProviderFormatGemini
	default:
		return ""
	}
}
