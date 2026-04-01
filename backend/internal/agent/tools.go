package agent

import (
	"context"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"backend/internal/network"
)

type ToolExecutor struct {
	client *http.Client
}

const maxRedirectHops = 5

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
	currentURL, err := network.ValidatePublicHTTPURL(ctx, url)
	if err != nil {
		return "", err
	}

	client := *e.client
	client.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}

	currentMethod := method
	currentBody := body

	for redirectCount := 0; redirectCount <= maxRedirectHops; redirectCount++ {
		request, err := http.NewRequestWithContext(ctx, currentMethod, currentURL.String(), strings.NewReader(currentBody))
		if err != nil {
			return "", fmt.Errorf("build request: %w", err)
		}
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		if request.Header.Get("User-Agent") == "" {
			request.Header.Set("User-Agent", "Illyawish-Agent/1.0")
		}

		response, err := client.Do(request)
		if err != nil {
			return "", fmt.Errorf("send request: %w", err)
		}

		if isRedirectStatus(response.StatusCode) {
			location := strings.TrimSpace(response.Header.Get("Location"))
			_ = response.Body.Close()

			if location == "" {
				return "", fmt.Errorf("request failed: %s", response.Status)
			}
			if redirectCount == maxRedirectHops {
				return "", fmt.Errorf("request failed: stopped after %d redirects", maxRedirectHops)
			}

			nextURL, err := resolveRedirectTarget(ctx, currentURL, location)
			if err != nil {
				return "", err
			}

			currentURL = nextURL
			currentMethod, currentBody = redirectedRequest(method, currentMethod, currentBody, response.StatusCode)
			continue
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

	return "", fmt.Errorf("request failed: stopped after %d redirects", maxRedirectHops)
}

func isRedirectStatus(statusCode int) bool {
	switch statusCode {
	case http.StatusMovedPermanently,
		http.StatusFound,
		http.StatusSeeOther,
		http.StatusTemporaryRedirect,
		http.StatusPermanentRedirect:
		return true
	default:
		return false
	}
}

func resolveRedirectTarget(ctx context.Context, currentURL *url.URL, location string) (*url.URL, error) {
	parsedLocation, err := url.Parse(location)
	if err != nil {
		return nil, fmt.Errorf("unsafe URL: invalid redirect target")
	}
	resolvedURL := currentURL.ResolveReference(parsedLocation)
	return network.ValidatePublicHTTPURL(ctx, resolvedURL.String())
}

func redirectedRequest(originalMethod string, currentMethod string, currentBody string, statusCode int) (string, string) {
	switch statusCode {
	case http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther:
		if currentMethod != http.MethodGet && currentMethod != http.MethodHead {
			return http.MethodGet, ""
		}
	}

	return currentMethod, currentBody
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
