package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	componentmodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type httpDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

func defaultHTTPClient(client httpDoer) httpDoer {
	if client != nil {
		return client
	}
	return &http.Client{Timeout: 60 * time.Second}
}

func normalizeModelName(provider ProviderConfig, options RequestOptions) (string, error) {
	modelName := strings.TrimSpace(options.Model)
	if modelName == "" {
		modelName = strings.TrimSpace(provider.DefaultModel)
	}
	if modelName == "" {
		return "", errors.New("provider model is required")
	}
	return modelName, nil
}

func validateHTTPProvider(provider ProviderConfig) error {
	if strings.TrimSpace(provider.BaseURL) == "" {
		return errors.New("provider base URL is required")
	}
	if strings.TrimSpace(provider.APIKey) == "" {
		return errors.New("provider API key is required")
	}
	return nil
}

func buildJSONRequest(ctx context.Context, method string, endpoint string, body any, headers map[string]string) (*http.Request, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	return req, nil
}

func readJSONResponse(resp *http.Response, target any) error {
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("upstream returned %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("decode upstream response: %w", err)
	}
	return nil
}

func parseSSEStream[T any](ctx context.Context, body io.ReadCloser, onEvent func(T) error) error {
	defer body.Close()

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 4096), 1024*1024)

	var dataLines []string
	flush := func() error {
		if len(dataLines) == 0 {
			return nil
		}
		payload := strings.TrimSpace(strings.Join(dataLines, "\n"))
		dataLines = nil
		if payload == "" || payload == "[DONE]" {
			return nil
		}
		var event T
		if err := json.Unmarshal([]byte(payload), &event); err != nil {
			return fmt.Errorf("decode SSE event: %w", err)
		}
		return onEvent(event)
	}

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line := scanner.Text()
		if line == "" {
			if err := flush(); err != nil {
				return err
			}
			continue
		}
		if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return flush()
}

func streamMessagesFromReader(ctx context.Context, read func(func(*schema.Message) error) error) (*schema.StreamReader[*schema.Message], error) {
	reader, writer := schema.Pipe[*schema.Message](16)
	go func() {
		defer writer.Close()
		if err := read(func(message *schema.Message) error {
			if message == nil {
				return nil
			}
			if writer.Send(message, nil) {
				return io.EOF
			}
			return nil
		}); err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, io.EOF) {
			writer.Send(nil, err)
		}
	}()
	return reader, nil
}

func joinURL(baseURL string, path string) (string, error) {
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("provider base URL is required")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + path
	return parsed.String(), nil
}

func flattenMessages(messages []*schema.Message) (system string, contents []providerMessage) {
	contents = make([]providerMessage, 0, len(messages))
	var systemParts []string
	for _, message := range messages {
		if message == nil {
			continue
		}
		content := flattenSchemaMessageContent(message)
		switch message.Role {
		case schema.System:
			if content != "" {
				systemParts = append(systemParts, content)
			}
		case schema.Assistant:
			contents = append(contents, providerMessage{Role: "assistant", Content: content})
		default:
			contents = append(contents, providerMessage{Role: "user", Content: content})
		}
	}
	return strings.TrimSpace(strings.Join(systemParts, "\n\n")), contents
}

type providerMessage struct {
	Role    string
	Content string
}

func flattenSchemaMessageContent(message *schema.Message) string {
	if message == nil {
		return ""
	}
	if strings.TrimSpace(message.Content) != "" {
		return message.Content
	}

	var parts []string
	for _, part := range message.UserInputMultiContent {
		switch part.Type {
		case schema.ChatMessagePartTypeText:
			if strings.TrimSpace(part.Text) != "" {
				parts = append(parts, part.Text)
			}
		case schema.ChatMessagePartTypeImageURL:
			if part.Image != nil && part.Image.URL != nil && strings.TrimSpace(*part.Image.URL) != "" {
				parts = append(parts, "Image URL: "+strings.TrimSpace(*part.Image.URL))
			}
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n")
	}
	return ""
}

func responseMeta(finishReason string) *schema.ResponseMeta {
	if strings.TrimSpace(finishReason) == "" {
		return nil
	}
	return &schema.ResponseMeta{FinishReason: strings.TrimSpace(finishReason)}
}

func optionTemperature(options []componentmodel.Option) *float32 {
	parsed := componentmodel.GetCommonOptions(&componentmodel.Options{}, options...)
	return parsed.Temperature
}

func optionMaxTokens(options []componentmodel.Option) *int {
	parsed := componentmodel.GetCommonOptions(&componentmodel.Options{}, options...)
	if parsed.MaxTokens == nil || *parsed.MaxTokens <= 0 {
		return nil
	}
	return parsed.MaxTokens
}

func optionModel(options []componentmodel.Option) string {
	parsed := componentmodel.GetCommonOptions(&componentmodel.Options{}, options...)
	if parsed.Model == nil {
		return ""
	}
	return strings.TrimSpace(*parsed.Model)
}
