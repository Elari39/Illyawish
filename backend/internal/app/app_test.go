package app

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

func TestNewRegistersKnowledgeSpaceRoutesWithoutConflict(t *testing.T) {
	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempBackendDir := filepath.Join(t.TempDir(), "backend")
	if err := os.MkdirAll(tempBackendDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.Chdir(tempBackendDir); err != nil {
		t.Fatalf("Chdir() error = %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(workingDir); err != nil {
			t.Fatalf("restore working directory: %v", err)
		}
	})

	application, err := New()
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	expectedRoutes := map[string]bool{
		"PATCH /api/knowledge/spaces/:spaceId":  false,
		"DELETE /api/knowledge/spaces/:spaceId": false,
	}
	for _, route := range application.router.Routes() {
		key := route.Method + " " + route.Path
		if _, ok := expectedRoutes[key]; ok {
			expectedRoutes[key] = true
		}
	}

	for route, found := range expectedRoutes {
		if !found {
			t.Fatalf("expected route %s to be registered", route)
		}
	}
}

func TestNewUsesTrustedProxiesForLoginRateLimitBuckets(t *testing.T) {
	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempBackendDir := filepath.Join(t.TempDir(), "backend")
	if err := os.MkdirAll(tempBackendDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	dataDir := filepath.Join(filepath.Dir(tempBackendDir), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	configPath := filepath.Join(dataDir, "app.json")
	configBody := `{
  "sessionSecret": "existing-session-secret",
  "settingsEncryptionKey": "existing-settings-secret",
  "trustedProxies": ["127.0.0.1/32"]
}
`
	if err := os.WriteFile(configPath, []byte(configBody), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	if err := os.Chdir(tempBackendDir); err != nil {
		t.Fatalf("Chdir() error = %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(workingDir); err != nil {
			t.Fatalf("restore working directory: %v", err)
		}
	})

	application, err := New()
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	for range 5 {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"wrong-pass"}`))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Forwarded-For", "203.0.113.1")
		request.RemoteAddr = "127.0.0.1:12345"

		application.router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("expected failed login status %d, got %d body=%s", http.StatusUnauthorized, recorder.Code, recorder.Body.String())
		}
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"wrong-pass"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Forwarded-For", "203.0.113.2")
	request.RemoteAddr = "127.0.0.1:12345"

	application.router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected different forwarded client IP to avoid shared rate limit bucket, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}
