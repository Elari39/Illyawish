package app

import (
	"crypto/tls"
	"net/http"
	"testing"
)

func TestSessionOptionsForRequestUsesSecureCookiesForHTTPS(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "https://example.com/api/auth/me", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	request.TLS = &tls.ConnectionState{}

	options := sessionOptionsForRequest(request)
	if !options.Secure {
		t.Fatal("expected HTTPS request to use secure cookies")
	}
}

func TestSessionOptionsForRequestUsesForwardedProto(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "http://internal/api/auth/me", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	request.Header.Set("X-Forwarded-Proto", "https")

	options := sessionOptionsForRequest(request)
	if !options.Secure {
		t.Fatal("expected proxied HTTPS request to use secure cookies")
	}
}

func TestSessionOptionsForRequestLeavesLocalHTTPInsecure(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "http://localhost:5721/api/auth/me", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}

	options := sessionOptionsForRequest(request)
	if options.Secure {
		t.Fatal("expected local HTTP request to keep secure cookies disabled")
	}
}
