package provider

import (
	"context"

	"backend/internal/llm"
)

type llmProviderTester struct {
	model llm.ChatModel
}

func NewLLMProviderTester(model llm.ChatModel) providerTester {
	return &llmProviderTester{model: model}
}

func (t *llmProviderTester) Test(ctx context.Context, provider llm.ProviderConfig) error {
	temperature := float32(0)
	maxTokens := 8
	_, err := t.model.Stream(
		ctx,
		provider,
		[]llm.ChatMessage{{Role: "user", Content: "Reply with OK."}},
		llm.RequestOptions{
			Model:       provider.DefaultModel,
			Temperature: &temperature,
			MaxTokens:   &maxTokens,
		},
		nil,
	)
	return err
}
