package app

import (
	"crypto/tls"
	"net/http"
	"testing"
)

func TestNewHTTPServerDisablesWriteTimeoutForSSE(t *testing.T) {
	server := newHTTPServer(":5721", http.NewServeMux())

	if server.WriteTimeout != 0 {
		t.Fatalf("expected write timeout to be disabled for SSE, got %s", server.WriteTimeout)
	}
	if server.ReadHeaderTimeout != readHeaderTimeout {
		t.Fatalf("expected read header timeout %s, got %s", readHeaderTimeout, server.ReadHeaderTimeout)
	}
	if server.ReadTimeout != readTimeout {
		t.Fatalf("expected read timeout %s, got %s", readTimeout, server.ReadTimeout)
	}
	if server.IdleTimeout != idleTimeout {
		t.Fatalf("expected idle timeout %s, got %s", idleTimeout, server.IdleTimeout)
	}
}

func TestSessionOptionsForRequestUsesSecureCookiesForHTTPS(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "https://example.com/api/auth/me", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	request.TLS = &tls.ConnectionState{}

	options := sessionOptionsForRequest(request, false)
	if !options.Secure {
		t.Fatal("expected HTTPS request to use secure cookies")
	}
}

func TestSessionOptionsForRequestIgnoresForwardedProtoByDefault(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "http://internal/api/auth/me", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	request.Header.Set("X-Forwarded-Proto", "https")

	options := sessionOptionsForRequest(request, false)
	if options.Secure {
		t.Fatal("expected proxied HTTP request to ignore secure forwarding headers by default")
	}
}

func TestSessionOptionsForRequestUsesForwardedProtoWhenTrusted(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "http://internal/api/auth/me", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	request.Header.Set("X-Forwarded-Proto", "https")

	options := sessionOptionsForRequest(request, true)
	if !options.Secure {
		t.Fatal("expected proxied HTTPS request to use secure cookies")
	}
}

func TestSessionOptionsForRequestLeavesLocalHTTPInsecure(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "http://localhost:5721/api/auth/me", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}

	options := sessionOptionsForRequest(request, false)
	if options.Secure {
		t.Fatal("expected local HTTP request to keep secure cookies disabled")
	}
}
