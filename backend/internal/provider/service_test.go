package provider

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type fakeProviderTester struct {
	err error
}

func (f *fakeProviderTester) Test(context.Context, llm.ProviderConfig) error {
	return f.err
}

func TestCreatePresetEncryptsAPIKeyAndActivatesIt(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	preset, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "OpenAI",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test-123456",
		Models:       []string{"gpt-4.1-mini", "gpt-4.1"},
		DefaultModel: "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	if !preset.IsActive {
		t.Fatal("expected preset to be active")
	}
	if preset.EncryptedAPIKey == "sk-test-123456" {
		t.Fatal("expected API key to be encrypted at rest")
	}
	if preset.APIKeyHint == "" {
		t.Fatal("expected API key hint to be stored")
	}

	resolved, err := service.ResolveForUser(1)
	if err != nil {
		t.Fatalf("ResolveForUser() error = %v", err)
	}

	if resolved.Source != SourcePreset {
		t.Fatalf("expected provider source %q, got %q", SourcePreset, resolved.Source)
	}
	if resolved.Config.APIKey != "sk-test-123456" {
		t.Fatalf("expected decrypted API key, got %q", resolved.Config.APIKey)
	}
}

func TestUpdatePresetRetainsAPIKeyWhenNotProvided(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	preset, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "Preset A",
		BaseURL:      "https://example.com/v1",
		APIKey:       "original-key",
		Models:       []string{"model-a"},
		DefaultModel: "model-a",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	newName := "Preset B"
	newModel := "model-b"
	updated, err := service.UpdatePreset(1, preset.ID, UpdatePresetInput{
		Name:         &newName,
		Models:       &[]string{"model-a", "model-b"},
		DefaultModel: &newModel,
	})
	if err != nil {
		t.Fatalf("UpdatePreset() error = %v", err)
	}

	if updated.Name != newName {
		t.Fatalf("expected updated name %q, got %q", newName, updated.Name)
	}
	if updated.DefaultModel != newModel {
		t.Fatalf("expected updated model %q, got %q", newModel, updated.DefaultModel)
	}

	resolved, err := service.ResolveForUser(1)
	if err != nil {
		t.Fatalf("ResolveForUser() error = %v", err)
	}
	if resolved.Config.APIKey != "original-key" {
		t.Fatalf("expected original API key to be preserved, got %q", resolved.Config.APIKey)
	}
}

func TestOnlyOnePresetRemainsActive(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	first, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "First",
		BaseURL:      "https://one.example.com/v1",
		APIKey:       "key-one",
		Models:       []string{"model-one"},
		DefaultModel: "model-one",
	})
	if err != nil {
		t.Fatalf("CreatePreset(first) error = %v", err)
	}

	second, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "Second",
		BaseURL:      "https://two.example.com/v1",
		APIKey:       "key-two",
		Models:       []string{"model-two"},
		DefaultModel: "model-two",
	})
	if err != nil {
		t.Fatalf("CreatePreset(second) error = %v", err)
	}

	state, err := service.ListState(1)
	if err != nil {
		t.Fatalf("ListState() error = %v", err)
	}

	if state.ActivePresetID == nil || *state.ActivePresetID != second.ID {
		t.Fatalf("expected second preset to be active, got %v", state.ActivePresetID)
	}
	if !state.Presets[0].IsActive || state.Presets[0].ID != second.ID {
		t.Fatalf("expected latest preset to be listed as active, got preset %d", state.Presets[0].ID)
	}

	if _, err := service.ActivatePreset(1, first.ID); err != nil {
		t.Fatalf("ActivatePreset() error = %v", err)
	}

	updatedState, err := service.ListState(1)
	if err != nil {
		t.Fatalf("ListState() after activate error = %v", err)
	}

	if updatedState.ActivePresetID == nil || *updatedState.ActivePresetID != first.ID {
		t.Fatalf("expected first preset to be active after activate, got %v", updatedState.ActivePresetID)
	}
}

func TestResolveFallsBackToServerConfig(t *testing.T) {
	service := newTestService(t, &config.Config{
		OpenAIBaseURL: "https://fallback.example.com/v1",
		OpenAIAPIKey:  "fallback-key",
		Model:         "fallback-model",
		SessionSecret: "session-secret",
	})

	resolved, err := service.ResolveForUser(1)
	if err != nil {
		t.Fatalf("ResolveForUser() error = %v", err)
	}

	if resolved.Source != SourceFallback {
		t.Fatalf("expected provider source %q, got %q", SourceFallback, resolved.Source)
	}
	if resolved.Config.DefaultModel != "fallback-model" {
		t.Fatalf("expected fallback model, got %q", resolved.Config.DefaultModel)
	}
}

func TestListStateMarksServerFallbackAsCurrentSource(t *testing.T) {
	service := newTestService(t, &config.Config{
		OpenAIBaseURL: "https://fallback.example.com/v1",
		OpenAIAPIKey:  "fallback-key",
		Model:         "fallback-model",
		SessionSecret: "session-secret",
	})

	state, err := service.ListState(1)
	if err != nil {
		t.Fatalf("ListState() error = %v", err)
	}

	if state.CurrentSource != SourceFallback {
		t.Fatalf("expected current source %q, got %q", SourceFallback, state.CurrentSource)
	}
	if !state.Fallback.Available {
		t.Fatal("expected fallback to be marked available")
	}
}

func TestResolveRequiresProviderOrCompleteFallback(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	_, err := service.ResolveForUser(1)
	if err == nil {
		t.Fatal("expected missing provider error, got nil")
	}
	if !errors.Is(err, ErrNoProviderConfigured) {
		t.Fatalf("expected ErrNoProviderConfigured, got %v", err)
	}
}

func TestSettingsEncryptionKeyOverridesSessionSecret(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret:         "session-secret",
		SettingsEncryptionKey: "settings-secret",
	})

	preset, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "Encrypted",
		BaseURL:      "https://example.com/v1",
		APIKey:       "override-key",
		Models:       []string{"model-a"},
		DefaultModel: "model-a",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	otherCrypter, err := newAPIKeyCrypter("settings-secret")
	if err != nil {
		t.Fatalf("newAPIKeyCrypter() error = %v", err)
	}

	decrypted, err := otherCrypter.Decrypt(preset.EncryptedAPIKey)
	if err != nil {
		t.Fatalf("Decrypt() error = %v", err)
	}
	if decrypted != "override-key" {
		t.Fatalf("expected decrypted key %q, got %q", "override-key", decrypted)
	}
}

func TestTestPresetUsesStoredAPIKeyWhenEditing(t *testing.T) {
	tester := &capturingProviderTester{}
	service := newTestServiceWithTester(t, &config.Config{
		SessionSecret: "session-secret",
	}, tester)

	preset, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "Preset A",
		BaseURL:      "https://example.com/v1",
		APIKey:       "stored-key",
		Models:       []string{"model-a"},
		DefaultModel: "model-a",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	result, err := service.TestPreset(context.Background(), 1, TestPresetInput{
		PresetID:     &preset.ID,
		DefaultModel: "model-b",
	})
	if err != nil {
		t.Fatalf("TestPreset() error = %v", err)
	}

	if !result.OK {
		t.Fatal("expected successful provider test")
	}
	if tester.lastConfig.APIKey != "stored-key" {
		t.Fatalf("expected stored API key to be reused, got %q", tester.lastConfig.APIKey)
	}
	if tester.lastConfig.DefaultModel != "model-b" {
		t.Fatalf("expected override model to be used, got %q", tester.lastConfig.DefaultModel)
	}
}

func TestTestPresetRejectsInvalidBaseURL(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	_, err := service.TestPreset(context.Background(), 1, TestPresetInput{
		BaseURL:      "not-a-url",
		APIKey:       "test-key",
		DefaultModel: "gpt-4.1-mini",
	})
	if err == nil {
		t.Fatal("expected invalid URL error")
	}
	if !IsRequestError(err) {
		t.Fatalf("expected request error, got %v", err)
	}
}

func TestCreatePresetIncludesDefaultModelInStoredModels(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	preset, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "OpenAI",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test",
		Models:       []string{"gpt-4.1"},
		DefaultModel: "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	if len(preset.Models) != 2 {
		t.Fatalf("expected normalized models to include default model, got %#v", preset.Models)
	}
	if preset.Models[0] != "gpt-4.1-mini" {
		t.Fatalf("expected default model to be inserted first, got %#v", preset.Models)
	}
}

func newTestService(t *testing.T, cfg *config.Config) *Service {
	t.Helper()
	return newTestServiceWithTester(t, cfg, &fakeProviderTester{})
}

type capturingProviderTester struct {
	lastConfig llm.ProviderConfig
}

func (c *capturingProviderTester) Test(_ context.Context, provider llm.ProviderConfig) error {
	c.lastConfig = provider
	return nil
}

func newTestServiceWithTester(t *testing.T, cfg *config.Config, tester providerTester) *Service {
	t.Helper()

	dsn := fmt.Sprintf("file:provider-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	if err := db.AutoMigrate(&models.User{}, &models.LLMProviderPreset{}); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	user := models.User{
		Username:     fmt.Sprintf("tester-%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	service, err := NewService(db, cfg, tester)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	return service
}
