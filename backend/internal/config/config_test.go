package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFromDataDirCreatesConfigFileWithDefaults(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")

	cfg, err := loadFromDataDir(dataDir)
	if err != nil {
		t.Fatalf("loadFromDataDir() error = %v", err)
	}

	if cfg.AppEnv != defaultAppEnv {
		t.Fatalf("expected app env %q, got %q", defaultAppEnv, cfg.AppEnv)
	}
	if cfg.ServerPort != defaultServerPort {
		t.Fatalf("expected server port %q, got %q", defaultServerPort, cfg.ServerPort)
	}
	if cfg.SQLitePath != filepath.Join(dataDir, defaultSQLiteFileName) {
		t.Fatalf("expected sqlite path inside data dir, got %q", cfg.SQLitePath)
	}
	if cfg.UploadDir != filepath.Join(dataDir, defaultUploadDirName) {
		t.Fatalf("expected upload dir inside data dir, got %q", cfg.UploadDir)
	}
	if len(cfg.SessionSecret) != 64 {
		t.Fatalf("expected generated session secret, got %q", cfg.SessionSecret)
	}
	if len(cfg.SettingsEncryptionKey) != 64 {
		t.Fatalf("expected generated encryption key, got %q", cfg.SettingsEncryptionKey)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("expected config file to be created: %v", err)
	}
}

func TestLoadFromDataDirReusesExistingSecretsAndFallback(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "appEnv": "production",
  "openAIBaseURL": "https://example.com/v1",
  "openAIApiKey": "test-key",
  "model": "test-model",
  "serverPort": "9000",
  "sqlitePath": "db.sqlite",
  "uploadDir": "uploads",
  "sessionSecret": "existing-session-secret",
  "settingsEncryptionKey": "existing-settings-secret"
}
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	cfg, err := loadFromDataDir(dataDir)
	if err != nil {
		t.Fatalf("loadFromDataDir() error = %v", err)
	}

	if cfg.OpenAIBaseURL != "https://example.com/v1" {
		t.Fatalf("expected fallback base URL to load, got %q", cfg.OpenAIBaseURL)
	}
	if cfg.OpenAIAPIKey != "test-key" {
		t.Fatalf("expected fallback API key to load, got %q", cfg.OpenAIAPIKey)
	}
	if cfg.Model != "test-model" {
		t.Fatalf("expected fallback model to load, got %q", cfg.Model)
	}
	if cfg.ServerPort != "9000" {
		t.Fatalf("expected stored server port, got %q", cfg.ServerPort)
	}
	if cfg.SQLitePath != filepath.Join(dataDir, "db.sqlite") {
		t.Fatalf("expected relative sqlite path to resolve from data dir, got %q", cfg.SQLitePath)
	}
	if cfg.UploadDir != filepath.Join(dataDir, "uploads") {
		t.Fatalf("expected relative upload dir to resolve from data dir, got %q", cfg.UploadDir)
	}
	if cfg.SessionSecret != "existing-session-secret" {
		t.Fatalf("expected session secret to be reused, got %q", cfg.SessionSecret)
	}
	if cfg.SettingsEncryptionKey != "existing-settings-secret" {
		t.Fatalf("expected settings encryption key to be reused, got %q", cfg.SettingsEncryptionKey)
	}
}

func TestLoadFromDataDirBackfillsMissingEncryptionKey(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "sessionSecret": "existing-session-secret"
}
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	cfg, err := loadFromDataDir(dataDir)
	if err != nil {
		t.Fatalf("loadFromDataDir() error = %v", err)
	}

	if cfg.SessionSecret != "existing-session-secret" {
		t.Fatalf("expected session secret to be reused, got %q", cfg.SessionSecret)
	}
	if cfg.SettingsEncryptionKey == "" {
		t.Fatal("expected missing settings encryption key to be generated")
	}

	payload, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config file: %v", err)
	}
	if !strings.Contains(string(payload), `"settingsEncryptionKey"`) {
		t.Fatalf("expected generated settings encryption key to be persisted, got %s", string(payload))
	}
}

func TestLoadFromDataDirRequiresBootstrapCredentialPair(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "bootstrapUsername": "admin"
}
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	if _, err := loadFromDataDir(dataDir); err == nil {
		t.Fatal("expected bootstrap credential validation to fail")
	}
}
