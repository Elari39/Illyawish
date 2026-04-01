package agent

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFetchURLRejectsRedirectToLocalAddress(t *testing.T) {
	var localTarget string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/start":
			http.Redirect(w, r, localTarget+"/private", http.StatusFound)
		case "/private":
			_, _ = io.WriteString(w, "private content")
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	localTarget = server.URL

	executor := NewToolExecutor(newRedirectTestClient(t, server))

	_, err := executor.FetchURL(context.Background(), "http://example.com/start")
	if err == nil {
		t.Fatal("expected redirect to local address to be rejected")
	}
	if !strings.Contains(err.Error(), "unsafe URL") {
		t.Fatalf("expected unsafe URL error, got %v", err)
	}
}

func TestFetchURLRejectsRedirectToReservedAddress(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/start":
			http.Redirect(w, r, "http://192.0.2.10/private", http.StatusFound)
		case "/private":
			_, _ = io.WriteString(w, "reserved content")
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	executor := NewToolExecutor(newRedirectTestClient(t, server))

	_, err := executor.FetchURL(context.Background(), "http://example.com/start")
	if err == nil {
		t.Fatal("expected redirect to reserved address to be rejected")
	}
	if !strings.Contains(err.Error(), "unsafe URL") {
		t.Fatalf("expected unsafe URL error, got %v", err)
	}
}

func TestFetchURLAllowsRedirectAcrossPublicHosts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/start":
			http.Redirect(w, r, "http://example.org/final", http.StatusFound)
		case "/final":
			_, _ = io.WriteString(w, "<html><body>safe public content</body></html>")
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	executor := NewToolExecutor(newRedirectTestClient(t, server))

	content, err := executor.FetchURL(context.Background(), "http://example.com/start")
	if err != nil {
		t.Fatalf("expected public redirect to succeed, got %v", err)
	}
	if content != "safe public content" {
		t.Fatalf("expected normalized response body, got %q", content)
	}
}

func newRedirectTestClient(t *testing.T, server *httptest.Server) *http.Client {
	t.Helper()

	serverAddress := strings.TrimPrefix(server.URL, "http://")
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			var dialer net.Dialer
			return dialer.DialContext(ctx, network, serverAddress)
		},
	}

	t.Cleanup(transport.CloseIdleConnections)

	return &http.Client{
		Transport: transport,
	}
}
