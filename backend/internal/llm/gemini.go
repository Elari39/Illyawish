package llm

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	componentmodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

func newGeminiChatModel(client httpDoer) ChatModel {
	return &baseModelChatAdapter{
		newBaseModel: func(provider ProviderConfig) componentmodel.BaseChatModel {
			return &geminiBaseChatModel{
				provider: provider,
				client:   defaultHTTPClient(client),
			}
		},
	}
}

type geminiBaseChatModel struct {
	provider ProviderConfig
	client   httpDoer
}

type geminiRequest struct {
	SystemInstruction *geminiContent           `json:"systemInstruction,omitempty"`
	Contents          []geminiContent          `json:"contents"`
	GenerationConfig  *geminiGenerationConfig  `json:"generationConfig,omitempty"`
}

type geminiGenerationConfig struct {
	Temperature     *float32 `json:"temperature,omitempty"`
	MaxOutputTokens *int     `json:"maxOutputTokens,omitempty"`
}

type geminiContent struct {
	Role  string            `json:"role,omitempty"`
	Parts []geminiPart      `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []geminiPart `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
}

func (m *geminiBaseChatModel) Generate(ctx context.Context, input []*schema.Message, opts ...componentmodel.Option) (*schema.Message, error) {
	request, endpoint, err := m.buildRequest(input, opts, false)
	if err != nil {
		return nil, err
	}

	req, err := buildJSONRequest(ctx, http.MethodPost, endpoint, request, nil)
	if err != nil {
		return nil, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}

	var payload geminiResponse
	if err := readJSONResponse(resp, &payload); err != nil {
		return nil, err
	}
	return geminiMessageFromResponse(payload), nil
}

func (m *geminiBaseChatModel) Stream(ctx context.Context, input []*schema.Message, opts ...componentmodel.Option) (*schema.StreamReader[*schema.Message], error) {
	request, endpoint, err := m.buildRequest(input, opts, true)
	if err != nil {
		return nil, err
	}

	req, err := buildJSONRequest(ctx, http.MethodPost, endpoint, request, nil)
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
		return parseSSEStream[geminiResponse](ctx, resp.Body, func(event geminiResponse) error {
			message := geminiMessageFromResponse(event)
			if message == nil {
				return nil
			}
			return send(message)
		})
	})
}

func (m *geminiBaseChatModel) buildRequest(input []*schema.Message, opts []componentmodel.Option, stream bool) (*geminiRequest, string, error) {
	if err := validateHTTPProvider(m.provider); err != nil {
		return nil, "", err
	}

	modelName := optionModel(opts)
	if modelName == "" {
		modelName = m.provider.DefaultModel
	}
	if modelName == "" {
		return nil, "", fmt.Errorf("provider model is required")
	}

	system, contents := flattenMessages(input)
	requestContents := make([]geminiContent, 0, len(contents))
	for _, content := range contents {
		role := "user"
		if content.Role == "assistant" {
			role = "model"
		}
		requestContents = append(requestContents, geminiContent{
			Role: role,
			Parts: []geminiPart{{
				Text: content.Content,
			}},
		})
	}

	generationConfig := &geminiGenerationConfig{
		Temperature:     optionTemperature(opts),
		MaxOutputTokens: optionMaxTokens(opts),
	}

	endpoint, err := joinURL(m.provider.BaseURL, "/models/"+modelName)
	if err != nil {
		return nil, "", err
	}
	if stream {
		endpoint += ":streamGenerateContent"
	} else {
		endpoint += ":generateContent"
	}
	querySeparator := "?"
	if strings.Contains(endpoint, "?") {
		querySeparator = "&"
	}
	if stream {
		endpoint += querySeparator + "alt=sse"
		querySeparator = "&"
	}
	endpoint += querySeparator + "key=" + url.QueryEscape(m.provider.APIKey)

	request := &geminiRequest{
		Contents:         requestContents,
		GenerationConfig: generationConfig,
	}
	if system != "" {
		request.SystemInstruction = &geminiContent{
			Parts: []geminiPart{{Text: system}},
		}
	}
	return request, endpoint, nil
}

func geminiMessageFromResponse(response geminiResponse) *schema.Message {
	if len(response.Candidates) == 0 {
		return nil
	}
	candidate := response.Candidates[0]
	var builder strings.Builder
	for _, part := range candidate.Content.Parts {
		if part.Text != "" {
			builder.WriteString(part.Text)
		}
	}
	return &schema.Message{
		Role:         schema.Assistant,
		Content:      builder.String(),
		ResponseMeta: responseMeta(candidate.FinishReason),
	}
}
