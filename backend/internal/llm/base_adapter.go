package llm

import (
	"context"
	"fmt"
	"io"

	componentmodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type baseModelChatAdapter struct {
	newBaseModel func(provider ProviderConfig) componentmodel.BaseChatModel
}

func (m *baseModelChatAdapter) Stream(
	ctx context.Context,
	provider ProviderConfig,
	messages []ChatMessage,
	options RequestOptions,
	onDelta func(StreamDelta),
) (StreamResult, error) {
	baseModel := m.newBaseModel(provider)
	stream, err := baseModel.Stream(ctx, toSchemaMessages(messages), toModelOptions(options)...)
	if err != nil {
		if shouldFallbackToGenerate(err) {
			return generateOnce(ctx, baseModel, messages, options, onDelta)
		}
		return StreamResult{}, fmt.Errorf("start model stream: %w", err)
	}
	defer stream.Close()

	result := StreamResult{}
	for {
		message, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				return result, nil
			}
			return result, fmt.Errorf("read model stream: %w", err)
		}

		if message != nil && message.ResponseMeta != nil && message.ResponseMeta.FinishReason != "" {
			result.FinishReason = message.ResponseMeta.FinishReason
		}

		delta := StreamDelta{
			Content:   extractAssistantText(message),
			Reasoning: extractAssistantReasoning(message),
		}
		if delta.Content == "" && delta.Reasoning == "" {
			continue
		}

		result.Content += delta.Content
		result.ReasoningContent += delta.Reasoning
		if onDelta != nil {
			onDelta(delta)
		}
	}
}

func generateOnce(
	ctx context.Context,
	chatModel componentmodel.BaseChatModel,
	messages []ChatMessage,
	options RequestOptions,
	onDelta func(StreamDelta),
) (StreamResult, error) {
	msg, err := chatModel.Generate(ctx, toSchemaMessages(messages), toModelOptions(options)...)
	if err != nil {
		return StreamResult{}, fmt.Errorf("generate model completion: %w", err)
	}

	fullText := extractAssistantText(msg)
	reasoning := extractAssistantReasoning(msg)
	if (fullText != "" || reasoning != "") && onDelta != nil {
		onDelta(StreamDelta{
			Content:   fullText,
			Reasoning: reasoning,
		})
	}

	return StreamResult{
		Content:          fullText,
		ReasoningContent: reasoning,
		FinishReason:     extractFinishReason(msg),
	}, nil
}

func schemaAssistantChunk(content string, finishReason string) *schema.Message {
	return &schema.Message{
		Role:         schema.Assistant,
		Content:      content,
		ResponseMeta: responseMeta(finishReason),
	}
}
