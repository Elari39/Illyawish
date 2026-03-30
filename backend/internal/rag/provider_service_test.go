package rag

import (
	"fmt"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreateProviderPresetEncryptsAPIKeyAndActivatesIt(t *testing.T) {
	service := newTestProviderService(t, &config.Config{
		SessionSecret: "session-secret",
		RAGBaseURL:    "https://api.siliconflow.cn/v1",
	})

	preset, err := service.CreateProviderPreset(1, CreateProviderPresetInput{
		Name:           "SiliconFlow",
		BaseURL:        "https://api.siliconflow.cn/v1",
		APIKey:         "sk-test-123",
		EmbeddingModel: "embed-a",
		RerankerModel:  "rerank-a",
	})
	if err != nil {
		t.Fatalf("CreateProviderPreset() error = %v", err)
	}

	if !preset.IsActive {
		t.Fatal("expected provider preset to be active")
	}
	if preset.EncryptedAPIKey == "sk-test-123" {
		t.Fatal("expected API key to be encrypted")
	}

	resolved, err := service.ResolveProviderForUser(1)
	if err != nil {
		t.Fatalf("ResolveProviderForUser() error = %v", err)
	}
	if resolved.Source != ProviderSourcePreset {
		t.Fatalf("expected preset source, got %q", resolved.Source)
	}
	if resolved.Config.APIKey != "sk-test-123" {
		t.Fatalf("expected decrypted API key, got %q", resolved.Config.APIKey)
	}
}

func TestResolveProviderFallsBackToWorkspaceConfig(t *testing.T) {
	service := newTestProviderService(t, &config.Config{
		SessionSecret:     "session-secret",
		RAGBaseURL:        "https://api.siliconflow.cn/v1",
		RAGAPIKey:         "workspace-key",
		RAGEmbeddingModel: "embed-default",
		RAGRerankerModel:  "rerank-default",
	})

	resolved, err := service.ResolveProviderForUser(7)
	if err != nil {
		t.Fatalf("ResolveProviderForUser() error = %v", err)
	}
	if resolved.Source != ProviderSourceFallback {
		t.Fatalf("expected fallback source, got %q", resolved.Source)
	}
	if resolved.Config.EmbeddingModel != "embed-default" {
		t.Fatalf("expected embedding model from fallback, got %q", resolved.Config.EmbeddingModel)
	}
}

func TestListProviderStateDoesNotAdvertiseIncompleteFallback(t *testing.T) {
	service := newTestProviderService(t, &config.Config{
		SessionSecret:     "session-secret",
		RAGBaseURL:        "https://api.siliconflow.cn/v1",
		RAGAPIKey:         "workspace-key",
		RAGEmbeddingModel: "embed-default",
	})

	state, err := service.ListProviderState(7)
	if err != nil {
		t.Fatalf("ListProviderState() error = %v", err)
	}

	if state.Fallback.Available {
		t.Fatal("expected incomplete fallback to be unavailable")
	}
	if state.CurrentSource != ProviderSourceNone {
		t.Fatalf("expected current source %q, got %q", ProviderSourceNone, state.CurrentSource)
	}
}

func TestListProviderStateMarksCompleteFallbackAsAvailable(t *testing.T) {
	service := newTestProviderService(t, &config.Config{
		SessionSecret:     "session-secret",
		RAGBaseURL:        "https://api.siliconflow.cn/v1",
		RAGAPIKey:         "workspace-key",
		RAGEmbeddingModel: "embed-default",
		RAGRerankerModel:  "rerank-default",
	})

	state, err := service.ListProviderState(7)
	if err != nil {
		t.Fatalf("ListProviderState() error = %v", err)
	}

	if !state.Fallback.Available {
		t.Fatal("expected complete fallback to be available")
	}
	if state.CurrentSource != ProviderSourceFallback {
		t.Fatalf("expected current source %q, got %q", ProviderSourceFallback, state.CurrentSource)
	}
}

func TestListProviderStateDoesNotAdvertiseFallbackWhenAPIKeyMissing(t *testing.T) {
	service := newTestProviderService(t, &config.Config{
		SessionSecret:     "session-secret",
		RAGBaseURL:        "https://api.siliconflow.cn/v1",
		RAGEmbeddingModel: "embed-default",
		RAGRerankerModel:  "rerank-default",
	})

	state, err := service.ListProviderState(7)
	if err != nil {
		t.Fatalf("ListProviderState() error = %v", err)
	}

	if state.Fallback.Available {
		t.Fatal("expected fallback without API key to be unavailable")
	}
	if state.CurrentSource != ProviderSourceNone {
		t.Fatalf("expected current source %q, got %q", ProviderSourceNone, state.CurrentSource)
	}
}

func TestActivateProviderPresetLeavesOnlyOneActivePreset(t *testing.T) {
	service := newTestProviderService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	first, err := service.CreateProviderPreset(1, CreateProviderPresetInput{
		Name:           "First",
		BaseURL:        "https://one.example.com/v1",
		APIKey:         "key-1",
		EmbeddingModel: "embed-1",
		RerankerModel:  "rerank-1",
	})
	if err != nil {
		t.Fatalf("CreateProviderPreset(first) error = %v", err)
	}
	second, err := service.CreateProviderPreset(1, CreateProviderPresetInput{
		Name:           "Second",
		BaseURL:        "https://two.example.com/v1",
		APIKey:         "key-2",
		EmbeddingModel: "embed-2",
		RerankerModel:  "rerank-2",
	})
	if err != nil {
		t.Fatalf("CreateProviderPreset(second) error = %v", err)
	}

	if _, err := service.ActivateProviderPreset(1, first.ID); err != nil {
		t.Fatalf("ActivateProviderPreset() error = %v", err)
	}

	state, err := service.ListProviderState(1)
	if err != nil {
		t.Fatalf("ListProviderState() error = %v", err)
	}
	if state.ActivePresetID == nil || *state.ActivePresetID != first.ID {
		t.Fatalf("expected first preset active, got %v", state.ActivePresetID)
	}
	if len(state.Presets) != 2 || state.Presets[1].ID != second.ID {
		t.Fatalf("expected both presets in state, got %#v", state.Presets)
	}
}

func TestProviderStateMasksStoredAPIKeys(t *testing.T) {
	service := newTestProviderService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	if _, err := service.CreateProviderPreset(1, CreateProviderPresetInput{
		Name:           "Primary",
		BaseURL:        "https://example.com/v1",
		APIKey:         "secret-key",
		EmbeddingModel: "embed",
		RerankerModel:  "rerank",
	}); err != nil {
		t.Fatalf("CreateProviderPreset() error = %v", err)
	}

	state, err := service.ListProviderState(1)
	if err != nil {
		t.Fatalf("ListProviderState() error = %v", err)
	}
	if len(state.Presets) != 1 {
		t.Fatalf("expected 1 preset, got %d", len(state.Presets))
	}
	if !state.Presets[0].HasAPIKey || state.Presets[0].APIKeyHint == "" {
		t.Fatalf("expected API key hint to be exposed without plaintext, got %#v", state.Presets[0])
	}
}

func newTestProviderService(t *testing.T, cfg *config.Config) *ProviderService {
	t.Helper()

	dsn := fmt.Sprintf("file:rag-provider-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.RAGProviderPreset{}); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	service, err := NewProviderService(db, cfg)
	if err != nil {
		t.Fatalf("NewProviderService() error = %v", err)
	}
	return service
}
