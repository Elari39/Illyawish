package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReadsEnvFile(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")
	content := "OPENAI_BASE_URL=https://example.com/v1\nOPENAI_API_KEY=test-key\nMODEL=test-model\n"
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
}

func TestLoadRequiresModelConfig(t *testing.T) {
	tmpDir := t.TempDir()
	envFile := filepath.Join(tmpDir, ".env")
	content := "OPENAI_BASE_URL=https://example.com/v1\nOPENAI_API_KEY=test-key\n"
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
		t.Fatal("expected error for missing MODEL")
	}
}
