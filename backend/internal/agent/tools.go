package agent

import (
	"context"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"

	"backend/internal/network"
)

type ToolExecutor struct {
	client *http.Client
}

func NewToolExecutor(client *http.Client) *ToolExecutor {
	if client == nil {
		client = http.DefaultClient
	}
	return &ToolExecutor{client: client}
}

func (e *ToolExecutor) FetchURL(ctx context.Context, url string) (string, error) {
	body, err := e.doRequest(ctx, http.MethodGet, url, nil, "")
	if err != nil {
		return "", err
	}
	return normalizeFetchedText(body), nil
}

func (e *ToolExecutor) ExecuteHTTPRequest(ctx context.Context, method string, url string, headers map[string]string, body string) (string, error) {
	return e.doRequest(ctx, method, url, headers, body)
}

func (e *ToolExecutor) TransformText(_ context.Context, content string) (string, error) {
	return strings.TrimSpace(compactWhitespace(content)), nil
}

func (e *ToolExecutor) doRequest(ctx context.Context, method string, url string, headers map[string]string, body string) (string, error) {
	parsed, err := network.ValidatePublicHTTPURL(ctx, url)
	if err != nil {
		return "", err
	}

	request, err := http.NewRequestWithContext(ctx, method, parsed.String(), strings.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	if request.Header.Get("User-Agent") == "" {
		request.Header.Set("User-Agent", "Illyawish-Agent/1.0")
	}

	response, err := e.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("send request: %w", err)
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
	if err != nil {
		return "", fmt.Errorf("read response body: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("request failed: %s", response.Status)
	}
	return string(payload), nil
}

var (
	scriptStylePattern = regexp.MustCompile(`(?is)<(script|style)[^>]*>.*?</(script|style)>`)
	tagPattern         = regexp.MustCompile(`(?s)<[^>]+>`)
	spacePattern       = regexp.MustCompile(`\s+`)
)

func normalizeFetchedText(content string) string {
	withoutScripts := scriptStylePattern.ReplaceAllString(content, " ")
	withoutTags := tagPattern.ReplaceAllString(withoutScripts, " ")
	unescaped := html.UnescapeString(withoutTags)
	return strings.TrimSpace(compactWhitespace(unescaped))
}

func compactWhitespace(content string) string {
	return spacePattern.ReplaceAllString(strings.TrimSpace(content), " ")
}
