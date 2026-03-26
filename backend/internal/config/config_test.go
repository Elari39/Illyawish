package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReadsEnvFile(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")
	content := "OPENAI_BASE_URL=https://example.com/v1\nOPENAI_API_KEY=test-key\nMODEL=test-model\nSETTINGS_ENCRYPTION_KEY=secret-key\nUPLOAD_DIR=./uploads\n"
	if err := os.WriteFile(envFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	previousWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(previousWD)
	})

	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Model != "test-model" {
		t.Fatalf("expected model to be test-model, got %q", cfg.Model)
	}
	if cfg.SQLitePath != "./data/aichat.db" {
		t.Fatalf("expected default sqlite path, got %q", cfg.SQLitePath)
	}
	if cfg.UploadDir != "./uploads" {
		t.Fatalf("expected upload dir to be loaded, got %q", cfg.UploadDir)
	}
	if cfg.SettingsEncryptionKey != "secret-key" {
		t.Fatalf("expected settings encryption key to be loaded, got %q", cfg.SettingsEncryptionKey)
	}
}

func TestLoadAllowsMissingAIConfig(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")
	content := "SERVER_PORT=9000\n"
	if err := os.WriteFile(envFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	previousWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(previousWD)
	})

	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.OpenAIBaseURL != "" {
		t.Fatalf("expected empty OPENAI_BASE_URL fallback, got %q", cfg.OpenAIBaseURL)
	}
	if cfg.Model != "" {
		t.Fatalf("expected empty MODEL fallback, got %q", cfg.Model)
	}
	if cfg.ServerPort != "9000" {
		t.Fatalf("expected server port from env file, got %q", cfg.ServerPort)
	}
}

func TestLoadRejectsPlaceholderSecretsInProduction(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")
	content := "APP_ENV=production\nSESSION_SECRET=change-me-session-secret\n"
	if err := os.WriteFile(envFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	previousWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(previousWD)
	})

	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}

	if _, err := Load(); err == nil {
		t.Fatal("expected production placeholder secret validation to fail")
	}
}

func TestLoadRequiresBootstrapCredentialPair(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")
	content := "BOOTSTRAP_USERNAME=admin\n"
	if err := os.WriteFile(envFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	previousWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(previousWD)
	})

	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}

	if _, err := Load(); err == nil {
		t.Fatal("expected bootstrap credential validation to fail")
	}
}
