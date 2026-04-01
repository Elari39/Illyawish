package llm

import (
	"context"
	"fmt"
	"net/http"

	componentmodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type anthropicChatModel struct {
	client httpDoer
}

func newAnthropicChatModel(client httpDoer) ChatModel {
	return &baseModelChatAdapter{
		newBaseModel: func(provider ProviderConfig) componentmodel.BaseChatModel {
			return &anthropicBaseChatModel{
				provider: provider,
				client:   defaultHTTPClient(client),
			}
		},
	}
}

type anthropicBaseChatModel struct {
	provider ProviderConfig
	client   httpDoer
}

type anthropicRequest struct {
	Model       string                     `json:"model"`
	MaxTokens   int                        `json:"max_tokens"`
	Temperature *float32                   `json:"temperature,omitempty"`
	System      string                     `json:"system,omitempty"`
	Messages    []anthropicRequestMessage  `json:"messages"`
	Stream      bool                       `json:"stream,omitempty"`
}

type anthropicRequestMessage struct {
	Role    string                   `json:"role"`
	Content []anthropicContentBlock  `json:"content"`
}

type anthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type anthropicResponse struct {
	Content    []anthropicContentBlock `json:"content"`
	StopReason string                  `json:"stop_reason"`
}

type anthropicStreamEvent struct {
	Type         string `json:"type"`
	Delta        struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"delta"`
	Message struct {
		StopReason string `json:"stop_reason"`
	} `json:"message"`
}

func (m *anthropicBaseChatModel) Generate(ctx context.Context, input []*schema.Message, opts ...componentmodel.Option) (*schema.Message, error) {
	request, endpoint, headers, err := m.buildRequest(ctx, input, opts, false)
	if err != nil {
		return nil, err
	}

	req, err := buildJSONRequest(ctx, http.MethodPost, endpoint, request, headers)
	if err != nil {
		return nil, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}

	var payload anthropicResponse
	if err := readJSONResponse(resp, &payload); err != nil {
		return nil, err
	}

	return &schema.Message{
		Role:         schema.Assistant,
		Content:      anthropicText(payload.Content),
		ResponseMeta: responseMeta(payload.StopReason),
	}, nil
}

func (m *anthropicBaseChatModel) Stream(ctx context.Context, input []*schema.Message, opts ...componentmodel.Option) (*schema.StreamReader[*schema.Message], error) {
	request, endpoint, headers, err := m.buildRequest(ctx, input, opts, true)
	if err != nil {
		return nil, err
	}

	req, err := buildJSONRequest(ctx, http.MethodPost, endpoint, request, headers)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream returned %s", resp.Status)
	}

	return streamMessagesFromReader(ctx, func(send func(*schema.Message) error) error {
		return parseSSEStream[anthropicStreamEvent](ctx, resp.Body, func(event anthropicStreamEvent) error {
			switch event.Type {
			case "content_block_delta":
				if event.Delta.Type == "text_delta" && event.Delta.Text != "" {
					return send(schema.AssistantMessage(event.Delta.Text, nil))
				}
			case "message_stop":
				return send(&schema.Message{
					Role:         schema.Assistant,
					ResponseMeta: responseMeta(event.Message.StopReason),
				})
			}
			return nil
		})
	})
}

func (m *anthropicBaseChatModel) buildRequest(_ context.Context, input []*schema.Message, opts []componentmodel.Option, stream bool) (*anthropicRequest, string, map[string]string, error) {
	if err := validateHTTPProvider(m.provider); err != nil {
		return nil, "", nil, err
	}

	modelName := optionModel(opts)
	if modelName == "" {
		modelName = m.provider.DefaultModel
	}
	if modelName == "" {
		return nil, "", nil, fmt.Errorf("provider model is required")
	}

	system, contents := flattenMessages(input)
	messages := make([]anthropicRequestMessage, 0, len(contents))
	for _, content := range contents {
		messages = append(messages, anthropicRequestMessage{
			Role: content.Role,
			Content: []anthropicContentBlock{{
				Type: "text",
				Text: content.Content,
			}},
		})
	}

	maxTokens := 1024
	if tokenLimit := optionMaxTokens(opts); tokenLimit != nil {
		maxTokens = *tokenLimit
	}

	endpoint, err := joinURL(m.provider.BaseURL, "/messages")
	if err != nil {
		return nil, "", nil, err
	}

	return &anthropicRequest{
			Model:       modelName,
			MaxTokens:   maxTokens,
			Temperature: optionTemperature(opts),
			System:      system,
			Messages:    messages,
			Stream:      stream,
		}, endpoint, map[string]string{
			"x-api-key":         m.provider.APIKey,
			"anthropic-version": "2023-06-01",
		}, nil
}

func anthropicText(blocks []anthropicContentBlock) string {
	text := ""
	for _, block := range blocks {
		if block.Type == "text" {
			text += block.Text
		}
	}
	return text
}
