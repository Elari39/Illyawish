package agent

import (
	"context"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/netip"
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
	currentTarget, err := network.ResolvePublicHTTPURL(ctx, url)
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
		request, err := http.NewRequestWithContext(ctx, currentMethod, currentTarget.URL.String(), strings.NewReader(currentBody))
		if err != nil {
			return "", fmt.Errorf("build request: %w", err)
		}
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		if request.Header.Get("User-Agent") == "" {
			request.Header.Set("User-Agent", "Illyawish-Agent/1.0")
		}

		response, err := doLockedRequest(&client, request, currentTarget)
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

			nextTarget, err := resolveRedirectTarget(ctx, currentTarget.URL, location)
			if err != nil {
				return "", err
			}

			currentTarget = nextTarget
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

func doLockedRequest(
	baseClient *http.Client,
	request *http.Request,
	target *network.ResolvedPublicHTTPURL,
) (*http.Response, error) {
	client, err := lockedClientForTarget(baseClient, request.URL, target.IPs)
	if err != nil {
		return nil, err
	}

	return client.Do(request)
}

func lockedClientForTarget(
	baseClient *http.Client,
	requestURL *url.URL,
	allowedIPs []netip.Addr,
) (*http.Client, error) {
	lockedTransport, err := lockedTransportForTarget(baseClient.Transport, requestURL, allowedIPs)
	if err != nil {
		return nil, err
	}

	client := *baseClient
	client.Transport = lockedTransport
	return &client, nil
}

func lockedTransportForTarget(
	baseTransport http.RoundTripper,
	requestURL *url.URL,
	allowedIPs []netip.Addr,
) (http.RoundTripper, error) {
	if requestURL == nil {
		return nil, fmt.Errorf("missing request URL")
	}
	if len(allowedIPs) == 0 {
		return nil, fmt.Errorf("no allowed public IPs resolved for host")
	}

	if baseTransport == nil {
		baseTransport = http.DefaultTransport
	}

	transport, ok := baseTransport.(*http.Transport)
	if !ok {
		return nil, fmt.Errorf("unsupported transport type %T", baseTransport)
	}

	clone := transport.Clone()
	clone.Proxy = nil

	port := requestURL.Port()
	if port == "" {
		port = defaultPortForScheme(requestURL.Scheme)
	}

	clone.DialContext = lockedDialContext(
		transport.DialContext,
		transport.Dial,
		port,
		allowedIPs,
	)
	if transport.DialTLSContext != nil {
		clone.DialTLSContext = lockedTLSDialContext(transport.DialTLSContext, port, allowedIPs)
	}

	return clone, nil
}

func lockedDialContext(
	baseDialContext func(context.Context, string, string) (net.Conn, error),
	baseDial func(string, string) (net.Conn, error),
	port string,
	allowedIPs []netip.Addr,
) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, networkName string, _ string) (net.Conn, error) {
		var lastErr error
		for _, allowedIP := range allowedIPs {
			dialAddress := net.JoinHostPort(allowedIP.String(), port)
			var (
				conn net.Conn
				err  error
			)
			switch {
			case baseDialContext != nil:
				conn, err = baseDialContext(ctx, networkName, dialAddress)
			case baseDial != nil:
				conn, err = baseDial(networkName, dialAddress)
			default:
				var dialer net.Dialer
				conn, err = dialer.DialContext(ctx, networkName, dialAddress)
			}
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, fmt.Errorf("no allowed public IPs resolved for host")
	}
}

func lockedTLSDialContext(
	baseDialTLSContext func(context.Context, string, string) (net.Conn, error),
	port string,
	allowedIPs []netip.Addr,
) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, networkName string, _ string) (net.Conn, error) {
		var lastErr error
		for _, allowedIP := range allowedIPs {
			dialAddress := net.JoinHostPort(allowedIP.String(), port)
			conn, err := baseDialTLSContext(ctx, networkName, dialAddress)
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, fmt.Errorf("no allowed public IPs resolved for host")
	}
}

func defaultPortForScheme(scheme string) string {
	if strings.EqualFold(scheme, "https") {
		return "443"
	}
	return "80"
}

func resolveRedirectTarget(ctx context.Context, currentURL *url.URL, location string) (*network.ResolvedPublicHTTPURL, error) {
	parsedLocation, err := url.Parse(location)
	if err != nil {
		return nil, fmt.Errorf("unsafe URL: invalid redirect target")
	}
	resolvedURL := currentURL.ResolveReference(parsedLocation)
	return network.ResolvePublicHTTPURL(ctx, resolvedURL.String())
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
