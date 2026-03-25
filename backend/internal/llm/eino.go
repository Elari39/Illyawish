package llm

import (
	"context"
	"fmt"
	"io"

	"backend/internal/config"

	"github.com/cloudwego/eino-ext/components/model/openai"
	componentmodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type Attachment struct {
	Name     string
	MIMEType string
	URL      string
}

type ChatMessage struct {
	Role        string
	Content     string
	Attachments []Attachment
}

type RequestOptions struct {
	Model       string
	Temperature *float32
	MaxTokens   *int
}

type ChatModel interface {
	Stream(ctx context.Context, messages []ChatMessage, options RequestOptions, onDelta func(string)) (string, error)
}

type EinoChatModel struct {
	model componentmodel.BaseChatModel
}

func New(cfg *config.Config) (*EinoChatModel, error) {
	ctx := context.Background()
	chatModel, err := openai.NewChatModel(ctx, &openai.ChatModelConfig{
		Model:   cfg.Model,
		BaseURL: cfg.OpenAIBaseURL,
		APIKey:  cfg.OpenAIAPIKey,
	})
	if err != nil {
		return nil, fmt.Errorf("create eino chat model: %w", err)
	}

	return &EinoChatModel{model: chatModel}, nil
}

func (m *EinoChatModel) Stream(
	ctx context.Context,
	messages []ChatMessage,
	options RequestOptions,
	onDelta func(string),
) (string, error) {
	stream, err := m.model.Stream(ctx, toSchemaMessages(messages), toModelOptions(options)...)
	if err != nil {
		return "", fmt.Errorf("start model stream: %w", err)
	}
	defer stream.Close()

	var fullText string
	for {
		msg, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				break
			}
			return fullText, fmt.Errorf("read model stream: %w", err)
		}

		chunk := msg.Content
		if chunk == "" {
			continue
		}

		fullText += chunk
		if onDelta != nil {
			onDelta(chunk)
		}
	}

	return fullText, nil
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
				if attachment.URL == "" {
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
