package provider

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/config"
	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

func TestCreateProviderCreatesPresetAndReturnsState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/ai/providers",
		bytes.NewBufferString(`{"name":"OpenAI","baseURL":"https://api.openai.com/v1","apiKey":"sk-test","defaultModel":"gpt-4.1-mini"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(service).CreateProvider(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"name":"OpenAI"`) {
		t.Fatalf("expected created preset in response, got %s", recorder.Body.String())
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
		bytes.NewBufferString(`{"name":"OpenAI 2","defaultModel":"gpt-4.1"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "1"}}
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(service).UpdateProvider(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"name":"OpenAI 2"`) {
		t.Fatalf("expected updated preset in response, got %s", recorder.Body.String())
	}
	if preset.ID != 1 {
		t.Fatalf("expected preset id 1, got %d", preset.ID)
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
