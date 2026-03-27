package provider

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/audit"
	"backend/internal/config"
	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

func TestCreateProviderCreatesPresetAndReturnsState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})
	if err := service.db.AutoMigrate(&models.AuditLog{}); err != nil {
		t.Fatalf("migrate audit logs: %v", err)
	}
	auditService := audit.NewService(service.db)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/ai/providers",
		bytes.NewBufferString(`{"name":"OpenAI","baseURL":"https://api.openai.com/v1","apiKey":"sk-test","models":["gpt-4.1-mini","gpt-4.1"],"defaultModel":"gpt-4.1-mini"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("current_user", &models.User{ID: 1, Username: "tester"})

	NewHandler(service, auditService).CreateProvider(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, recorder.Code)
	}

	var payload ProviderStateDTO
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(payload.Presets) != 1 {
		t.Fatalf("expected 1 preset in response, got %d", len(payload.Presets))
	}
	if payload.Presets[0].Name != "OpenAI" {
		t.Fatalf("expected created preset in response, got %s", recorder.Body.String())
	}
	if payload.Presets[0].HasAPIKey != true {
		t.Fatalf("expected preset to report a stored API key, got %#v", payload.Presets[0])
	}
	if payload.Presets[0].APIKeyHint == "" {
		t.Fatalf("expected API key hint in response, got %#v", payload.Presets[0])
	}

	var logs []models.AuditLog
	if err := service.db.Order("id asc").Find(&logs).Error; err != nil {
		t.Fatalf("query audit logs: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("expected 1 audit log, got %d", len(logs))
	}
	if logs[0].TargetType != "provider_preset" {
		t.Fatalf("expected provider_preset target type, got %q", logs[0].TargetType)
	}
	if logs[0].TargetID != "1" {
		t.Fatalf("expected audit log target id 1, got %q", logs[0].TargetID)
	}
	if logs[0].TargetName != "OpenAI" {
		t.Fatalf("expected audit log target name OpenAI, got %q", logs[0].TargetName)
	}
}

func TestUpdateProviderUpdatesPresetAndReturnsState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})
	preset, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "OpenAI",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test",
		Models:       []string{"gpt-4.1-mini"},
		DefaultModel: "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPatch,
		"/api/ai/providers/1",
		bytes.NewBufferString(`{"name":"OpenAI 2","models":["gpt-4.1","gpt-4.1-mini"],"defaultModel":"gpt-4.1"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "1"}}
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(service).UpdateProvider(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	var payload ProviderStateDTO
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(payload.Presets) != 1 {
		t.Fatalf("expected 1 preset in response, got %d", len(payload.Presets))
	}
	if payload.Presets[0].Name != "OpenAI 2" {
		t.Fatalf("expected updated preset in response, got %s", recorder.Body.String())
	}
	if payload.Presets[0].HasAPIKey != true {
		t.Fatalf("expected API key to remain stored, got %#v", payload.Presets[0])
	}
	if payload.Presets[0].APIKeyHint == "" {
		t.Fatalf("expected API key hint to remain visible, got %#v", payload.Presets[0])
	}
	if preset.ID != 1 {
		t.Fatalf("expected preset id 1, got %d", preset.ID)
	}
}

func TestListProvidersMasksStoredAPIKeysForEachPreset(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})
	first, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "OpenAI",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-openai",
		Models:       []string{"gpt-4.1-mini"},
		DefaultModel: "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreatePreset(first) error = %v", err)
	}
	second, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "Anthropic",
		BaseURL:      "https://api.anthropic.com/v1",
		APIKey:       "sk-anthropic",
		Models:       []string{"claude-sonnet"},
		DefaultModel: "claude-sonnet",
	})
	if err != nil {
		t.Fatalf("CreatePreset(second) error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/ai/providers", nil)
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(service).ListProviders(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	var payload ProviderStateDTO
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(payload.Presets) != 2 {
		t.Fatalf("expected 2 presets in response, got %d", len(payload.Presets))
	}
	if payload.Presets[0].ID != second.ID || !payload.Presets[0].HasAPIKey || payload.Presets[0].APIKeyHint == "" {
		t.Fatalf("expected active preset with masked key first, got %#v", payload.Presets[0])
	}
	if payload.Presets[1].ID != first.ID || !payload.Presets[1].HasAPIKey || payload.Presets[1].APIKeyHint == "" {
		t.Fatalf("expected inactive preset with masked key second, got %#v", payload.Presets[1])
	}
}

func TestActivateProviderReturnsNotFoundForMissingPreset(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/ai/providers/99/activate", nil)
	ctx.Params = gin.Params{{Key: "id", Value: "99"}}
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(service).ActivateProvider(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
	}
}

func TestDeleteProviderRemovesPresetAndReturnsUpdatedState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})
	preset, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "OpenAI",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test",
		Models:       []string{"gpt-4.1-mini"},
		DefaultModel: "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/ai/providers/1", nil)
	ctx.Params = gin.Params{{Key: "id", Value: "1"}}
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(service).DeleteProvider(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	var payload ProviderStateDTO
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(payload.Presets) != 0 {
		t.Fatalf("expected no presets after delete, got %d", len(payload.Presets))
	}
	if preset.ID != 1 {
		t.Fatalf("expected preset id 1, got %d", preset.ID)
	}
}

func TestTestProviderReturnsResolvedConfiguration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tester := &capturingProviderTester{}
	service := newTestServiceWithTester(t, &config.Config{
		SessionSecret: "session-secret",
	}, tester)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/ai/providers/test",
		bytes.NewBufferString(`{"baseURL":"https://api.openai.com/v1","apiKey":"sk-test","defaultModel":"gpt-4.1-mini"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(service).TestProvider(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"resolvedModel":"gpt-4.1-mini"`) {
		t.Fatalf("expected resolved model in response, got %s", recorder.Body.String())
	}
}
