package provider

import (
	"context"
	"strings"
	"testing"

	"backend/internal/config"
	"backend/internal/models"

	"gorm.io/gorm"
)

func TestNormalizeProviderModelsTrimsDeduplicatesAndPrependsDefaultModel(t *testing.T) {
	models, defaultModel, err := normalizeProviderModels(
		[]string{" gpt-4.1 ", "", "gpt-4.1", "gpt-4.1-mini"},
		" gpt-4o-mini ",
	)
	if err != nil {
		t.Fatalf("normalizeProviderModels() error = %v", err)
	}

	if defaultModel != "gpt-4o-mini" {
		t.Fatalf("expected trimmed default model, got %q", defaultModel)
	}
	if len(models) != 3 {
		t.Fatalf("expected 3 normalized models, got %#v", models)
	}
	if models[0] != "gpt-4o-mini" {
		t.Fatalf("expected default model to be inserted first, got %#v", models)
	}
	if models[1] != "gpt-4.1" || models[2] != "gpt-4.1-mini" {
		t.Fatalf("expected remaining models to stay deduplicated, got %#v", models)
	}
}

func TestNormalizeBaseURLTrimsTrailingSlashAndRejectsInvalidURLs(t *testing.T) {
	if got := normalizeBaseURL(" https://api.openai.com/v1/ "); got != "https://api.openai.com/v1" {
		t.Fatalf("expected normalized URL without trailing slash, got %q", got)
	}
	if got := normalizeBaseURL("api.openai.com/v1"); got != "" {
		t.Fatalf("expected missing scheme to be rejected, got %q", got)
	}
	if got := normalizeBaseURL("ftp://api.openai.com/v1"); got != "" {
		t.Fatalf("expected non-http scheme to be rejected, got %q", got)
	}
}

func TestAPIKeyCrypterRoundTripAndRejectsInvalidInput(t *testing.T) {
	crypter, err := newAPIKeyCrypter("session-secret")
	if err != nil {
		t.Fatalf("newAPIKeyCrypter() error = %v", err)
	}

	encrypted, err := crypter.Encrypt("sk-test-123456")
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}
	if encrypted == "sk-test-123456" {
		t.Fatal("expected encrypted output to differ from plaintext")
	}

	decrypted, err := crypter.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Decrypt() error = %v", err)
	}
	if decrypted != "sk-test-123456" {
		t.Fatalf("expected decrypted plaintext, got %q", decrypted)
	}

	if _, err := newAPIKeyCrypter("   "); err == nil {
		t.Fatal("expected empty secret to be rejected")
	}
	if _, err := crypter.Decrypt("not-valid-base64"); err == nil {
		t.Fatal("expected invalid ciphertext to be rejected")
	}
}

func TestResolveTestConfigInheritsPresetValues(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

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

	resolved, err := service.resolveTestConfig(1, TestPresetInput{
		PresetID: &preset.ID,
	})
	if err != nil {
		t.Fatalf("resolveTestConfig() error = %v", err)
	}

	if resolved.BaseURL != "https://example.com/v1" {
		t.Fatalf("expected preset base URL, got %q", resolved.BaseURL)
	}
	if resolved.APIKey != "stored-key" {
		t.Fatalf("expected preset API key, got %q", resolved.APIKey)
	}
	if resolved.DefaultModel != "model-a" {
		t.Fatalf("expected preset model, got %q", resolved.DefaultModel)
	}
}

func TestResolveTestConfigReusesActivePresetAPIKey(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	_, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "Primary",
		BaseURL:      "https://primary.example.com/v1",
		APIKey:       "shared-key",
		Models:       []string{"model-a"},
		DefaultModel: "model-a",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	resolved, err := service.resolveTestConfig(1, TestPresetInput{
		BaseURL:           "https://secondary.example.com/v1",
		DefaultModel:      "model-b",
		ReuseActiveAPIKey: true,
	})
	if err != nil {
		t.Fatalf("resolveTestConfig() error = %v", err)
	}

	if resolved.APIKey != "shared-key" {
		t.Fatalf("expected active preset API key to be reused, got %q", resolved.APIKey)
	}
}

func TestResolveTestConfigPreservesRequestErrorMessages(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	testCases := []struct {
		name    string
		input   TestPresetInput
		message string
	}{
		{
			name: "missing URL",
			input: TestPresetInput{
				APIKey:       "test-key",
				DefaultModel: "model-a",
			},
			message: "provider base URL must be a valid http or https URL",
		},
		{
			name: "missing API key",
			input: TestPresetInput{
				BaseURL:      "https://example.com/v1",
				DefaultModel: "model-a",
			},
			message: "provider API key is required",
		},
		{
			name: "missing model",
			input: TestPresetInput{
				BaseURL: "https://example.com/v1",
				APIKey:  "test-key",
			},
			message: "provider model is required",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := service.resolveTestConfig(1, testCase.input)
			if err == nil {
				t.Fatal("expected request error")
			}
			if !IsRequestError(err) {
				t.Fatalf("expected request error, got %v", err)
			}
			if err.Error() != testCase.message {
				t.Fatalf("expected error message %q, got %q", testCase.message, err.Error())
			}
		})
	}
}

func TestResolveTestConfigUsesPresetOverridesBeforeValidation(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

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

	resolved, err := service.resolveTestConfig(1, TestPresetInput{
		PresetID:     &preset.ID,
		DefaultModel: "model-b",
		BaseURL:      "",
		APIKey:       "",
	})
	if err != nil {
		t.Fatalf("resolveTestConfig() error = %v", err)
	}

	if resolved.DefaultModel != "model-b" {
		t.Fatalf("expected override model to win, got %q", resolved.DefaultModel)
	}
	if resolved.BaseURL != "https://example.com/v1" || resolved.APIKey != "stored-key" {
		t.Fatalf("expected preset URL and API key to be inherited, got %#v", resolved)
	}
}

func TestSanitizeUpdatePresetInputKeepsExistingModelListWhenOnlyDefaultChanges(t *testing.T) {
	current := &models.LLMProviderPreset{
		DefaultModel: "model-a",
		Models:       []string{"model-a", "model-b"},
	}
	newDefault := "model-b"

	normalized, err := sanitizeUpdatePresetInput(UpdatePresetInput{
		DefaultModel: &newDefault,
	}, current)
	if err != nil {
		t.Fatalf("sanitizeUpdatePresetInput() error = %v", err)
	}
	if normalized.Models == nil || normalized.DefaultModel == nil {
		t.Fatalf("expected normalized models and default model, got %#v", normalized)
	}
	if !containsModel(*normalized.Models, "model-a") || !containsModel(*normalized.Models, "model-b") {
		t.Fatalf("expected existing model list to be preserved, got %#v", *normalized.Models)
	}
}

func TestResolveTestConfigWrapsDecryptErrors(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

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

	if err := service.db.Model(&models.LLMProviderPreset{}).
		Where("id = ?", preset.ID).
		Update("encrypted_api_key", "not-valid-base64").Error; err != nil {
		t.Fatalf("corrupt preset API key: %v", err)
	}

	_, err = service.resolveTestConfig(1, TestPresetInput{
		PresetID: &preset.ID,
	})
	if err == nil {
		t.Fatal("expected decrypt error")
	}
	if !strings.Contains(err.Error(), "decrypt provider API key") {
		t.Fatalf("expected decrypt error wrapper, got %v", err)
	}
}

func TestTestPresetUsesResolveTestConfigBehavior(t *testing.T) {
	tester := &capturingProviderTester{}
	service := newTestServiceWithTester(t, &config.Config{
		SessionSecret: "session-secret",
	}, tester)

	_, err := service.CreatePreset(1, CreatePresetInput{
		Name:         "Primary",
		BaseURL:      "https://primary.example.com/v1",
		APIKey:       "shared-key",
		Models:       []string{"model-a"},
		DefaultModel: "model-a",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	result, err := service.TestPreset(context.Background(), 1, TestPresetInput{
		BaseURL:           "https://secondary.example.com/v1",
		DefaultModel:      "model-b",
		ReuseActiveAPIKey: true,
	})
	if err != nil {
		t.Fatalf("TestPreset() error = %v", err)
	}
	if !result.OK {
		t.Fatal("expected successful provider test")
	}
	if tester.lastConfig.APIKey != "shared-key" {
		t.Fatalf("expected reused API key, got %q", tester.lastConfig.APIKey)
	}
}

func TestGetPresetStillReturnsGormNotFound(t *testing.T) {
	service := newTestService(t, &config.Config{
		SessionSecret: "session-secret",
	})

	_, err := service.getPreset(1, 999)
	if err == nil {
		t.Fatal("expected not found error")
	}
	if err != gorm.ErrRecordNotFound {
		t.Fatalf("expected gorm.ErrRecordNotFound, got %v", err)
	}
}
