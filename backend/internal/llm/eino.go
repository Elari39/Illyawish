package llm

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/cloudwego/eino-ext/components/model/openai"
	componentmodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type Attachment struct {
	Kind     string
	Name     string
	MIMEType string
	URL      string
	Text     string
}

type ChatMessage struct {
	Role        string
	Content     string
	Attachments []Attachment
}

const (
	AttachmentKindImage = "image"
	AttachmentKindText  = "text"

	ProviderFormatOpenAI    = "openai"
	ProviderFormatAnthropic = "anthropic"
	ProviderFormatGemini    = "gemini"
)

type ProviderConfig struct {
	Format       string
	BaseURL      string
	APIKey       string
	DefaultModel string
}

type RequestOptions struct {
	Model       string
	Temperature *float32
	MaxTokens   *int
}

type StreamDelta struct {
	Content   string
	Reasoning string
}

type StreamResult struct {
	Content          string
	ReasoningContent string
	FinishReason     string
}

type ChatModel interface {
	Stream(
		ctx context.Context,
		provider ProviderConfig,
		messages []ChatMessage,
		options RequestOptions,
		onDelta func(StreamDelta),
	) (StreamResult, error)
}

type EinoChatModel struct {
	newChatModel func(context.Context, *openai.ChatModelConfig) (componentmodel.BaseChatModel, error)
}

func New() ChatModel {
	return &RouterChatModel{
		openai: &EinoChatModel{
			newChatModel: func(ctx context.Context, cfg *openai.ChatModelConfig) (componentmodel.BaseChatModel, error) {
				return openai.NewChatModel(ctx, cfg)
			},
		},
		anthropic: newAnthropicChatModel(nil),
		gemini:    newGeminiChatModel(nil),
	}
}

func (m *EinoChatModel) Stream(
	ctx context.Context,
	provider ProviderConfig,
	messages []ChatMessage,
	options RequestOptions,
	onDelta func(StreamDelta),
) (StreamResult, error) {
	modelCfg, err := buildChatModelConfig(provider, options)
	if err != nil {
		return StreamResult{}, err
	}

	chatModel, err := m.newChatModel(ctx, modelCfg)
	if err != nil {
		return StreamResult{}, fmt.Errorf("create eino chat model: %w", err)
	}

	stream, err := chatModel.Stream(ctx, toSchemaMessages(messages), toModelOptions(options)...)
	if err != nil {
		if shouldFallbackToGenerate(err) {
			result, fallbackErr := m.generateOnce(ctx, chatModel, messages, options, onDelta)
			if fallbackErr == nil {
				return result, nil
			}
			return StreamResult{}, fmt.Errorf("start model stream: %v; fallback completion failed: %w", err, fallbackErr)
		}
		return StreamResult{}, fmt.Errorf("start model stream: %w", err)
	}
	defer stream.Close()

	result := StreamResult{}
	for {
		msg, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				break
			}
			return result, fmt.Errorf("read model stream: %w", err)
		}

		if msg.ResponseMeta != nil && msg.ResponseMeta.FinishReason != "" {
			result.FinishReason = msg.ResponseMeta.FinishReason
		}

		delta := StreamDelta{
			Content:   extractAssistantText(msg),
			Reasoning: extractAssistantReasoning(msg),
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

	return result, nil
}

func (m *EinoChatModel) generateOnce(
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

func shouldFallbackToGenerate(err error) bool {
	if err == nil {
		return false
	}

	var apiErr *openai.APIError
	if errors.As(err, &apiErr) {
		return looksLikeUnsupportedStreaming(apiErr.Message)
	}

	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return true
	}

	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.HasSuffix(message, "eof") || looksLikeUnsupportedStreaming(message)
}

func looksLikeUnsupportedStreaming(message string) bool {
	normalized := strings.ToLower(strings.TrimSpace(message))
	if normalized == "" || !strings.Contains(normalized, "stream") {
		return false
	}

	return strings.Contains(normalized, "not support") ||
		strings.Contains(normalized, "unsupported")
}

func extractAssistantText(message *schema.Message) string {
	if message == nil {
		return ""
	}

	if message.Content != "" {
		return message.Content
	}

	var builder strings.Builder
	for _, part := range message.AssistantGenMultiContent {
		if part.Text == "" {
			continue
		}
		builder.WriteString(part.Text)
	}

	return builder.String()
}

func extractAssistantReasoning(message *schema.Message) string {
	if message == nil {
		return ""
	}
	if message.ReasoningContent != "" {
		return message.ReasoningContent
	}

	var builder strings.Builder
	for _, part := range message.AssistantGenMultiContent {
		if part.Type != schema.ChatMessagePartTypeReasoning || part.Reasoning == nil || part.Reasoning.Text == "" {
			continue
		}
		builder.WriteString(part.Reasoning.Text)
	}
	return builder.String()
}

func extractFinishReason(message *schema.Message) string {
	if message == nil || message.ResponseMeta == nil {
		return ""
	}
	return strings.TrimSpace(message.ResponseMeta.FinishReason)
}

func buildChatModelConfig(provider ProviderConfig, options RequestOptions) (*openai.ChatModelConfig, error) {
	baseURL := strings.TrimSpace(provider.BaseURL)
	if baseURL == "" {
		return nil, errors.New("provider base URL is required")
	}

	apiKey := strings.TrimSpace(provider.APIKey)
	if apiKey == "" {
		return nil, errors.New("provider API key is required")
	}

	modelName := strings.TrimSpace(options.Model)
	if modelName == "" {
		modelName = strings.TrimSpace(provider.DefaultModel)
	}
	if modelName == "" {
		return nil, errors.New("provider model is required")
	}

	return &openai.ChatModelConfig{
		Model:   modelName,
		BaseURL: baseURL,
		APIKey:  apiKey,
	}, nil
}

func toSchemaMessages(messages []ChatMessage) []*schema.Message {
	result := make([]*schema.Message, 0, len(messages))
	for _, msg := range messages {
		if msg.Role == string(schema.User) && len(msg.Attachments) > 0 {
			parts := make([]schema.MessageInputPart, 0, len(msg.Attachments)+1)
			if msg.Content != "" {
				parts = append(parts, schema.MessageInputPart{
					Type: schema.ChatMessagePartTypeText,
					Text: msg.Content,
				})
			}
			for _, attachment := range msg.Attachments {
				if attachment.Kind != AttachmentKindText || attachment.Text == "" {
					continue
				}
				parts = append(parts, schema.MessageInputPart{
					Type: schema.ChatMessagePartTypeText,
					Text: formatTextAttachment(attachment),
				})
			}
			for _, attachment := range msg.Attachments {
				if attachment.Kind != AttachmentKindImage || attachment.URL == "" {
					continue
				}
				url := attachment.URL
				parts = append(parts, schema.MessageInputPart{
					Type: schema.ChatMessagePartTypeImageURL,
					Image: &schema.MessageInputImage{
						MessagePartCommon: schema.MessagePartCommon{
							URL:      &url,
							MIMEType: attachment.MIMEType,
						},
						Detail: schema.ImageURLDetailHigh,
					},
				})
			}
			result = append(result, &schema.Message{
				Role:                  schema.User,
				UserInputMultiContent: parts,
			})
			continue
		}

		switch schema.RoleType(msg.Role) {
		case schema.System:
			result = append(result, schema.SystemMessage(msg.Content))
		case schema.Assistant:
			result = append(result, schema.AssistantMessage(msg.Content, nil))
		default:
			result = append(result, schema.UserMessage(msg.Content))
		}
	}

	return result
}

func formatTextAttachment(attachment Attachment) string {
	return fmt.Sprintf(
		"Attachment: %s\nType: %s\nContent:\n%s",
		strings.TrimSpace(attachment.Name),
		strings.TrimSpace(attachment.MIMEType),
		attachment.Text,
	)
}

func toModelOptions(options RequestOptions) []componentmodel.Option {
	modelOptions := make([]componentmodel.Option, 0, 3)
	if options.Model != "" {
		modelOptions = append(modelOptions, componentmodel.WithModel(options.Model))
	}
	if options.Temperature != nil {
		modelOptions = append(modelOptions, componentmodel.WithTemperature(*options.Temperature))
	}
	if options.MaxTokens != nil && *options.MaxTokens > 0 {
		modelOptions = append(modelOptions, componentmodel.WithMaxTokens(*options.MaxTokens))
	}
	return modelOptions
}
