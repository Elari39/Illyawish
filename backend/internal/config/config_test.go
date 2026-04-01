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
	if cfg.TrustProxyHeadersForSecureCookies {
		t.Fatal("expected trust proxy headers for secure cookies to default to false")
	}
	if cfg.RAGBaseURL == "" {
		t.Fatal("expected default RAG base URL to be populated")
	}
	if cfg.RAGAPIKey != "" {
		t.Fatalf("expected default RAG API key to be empty, got %q", cfg.RAGAPIKey)
	}
	if cfg.RAGEmbeddingModel != "Qwen/Qwen3-Embedding-8B" {
		t.Fatalf("expected default RAG embedding model, got %q", cfg.RAGEmbeddingModel)
	}
	if cfg.RAGRerankerModel != "Qwen/Qwen3-Reranker-8B" {
		t.Fatalf("expected default RAG reranker model, got %q", cfg.RAGRerankerModel)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("expected config file to be created: %v", err)
	}
	payload, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config file: %v", err)
	}
	if strings.Contains(string(payload), `"ragApiKey"`) {
		t.Fatalf("expected config file to omit empty ragApiKey, got %s", string(payload))
	}
}

func TestLoadFromDataDirCreatesSharedReadableConfigFile(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")

	if _, err := loadFromDataDir(dataDir); err != nil {
		t.Fatalf("loadFromDataDir() error = %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	info, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("stat config file: %v", err)
	}

	if info.Mode().Perm() != 0o644 {
		t.Fatalf("expected config file permissions 0644, got %04o", info.Mode().Perm())
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
  "settingsEncryptionKey": "existing-settings-secret",
  "ragBaseURL": "https://api.siliconflow.cn/v1",
  "ragApiKey": "rag-key",
  "ragEmbeddingModel": "embed-model",
  "ragRerankerModel": "rerank-model"
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
	if cfg.ProviderFormat != "openai" {
		t.Fatalf("expected legacy fallback format to default to openai, got %q", cfg.ProviderFormat)
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
	if cfg.RAGBaseURL != "https://api.siliconflow.cn/v1" {
		t.Fatalf("expected RAG base URL to load, got %q", cfg.RAGBaseURL)
	}
	if cfg.RAGAPIKey != "rag-key" {
		t.Fatalf("expected RAG API key to load, got %q", cfg.RAGAPIKey)
	}
	if cfg.RAGEmbeddingModel != "embed-model" {
		t.Fatalf("expected RAG embedding model to load, got %q", cfg.RAGEmbeddingModel)
	}
	if cfg.RAGRerankerModel != "rerank-model" {
		t.Fatalf("expected RAG reranker model to load, got %q", cfg.RAGRerankerModel)
	}
	if cfg.TrustProxyHeadersForSecureCookies {
		t.Fatal("expected trust proxy headers for secure cookies to remain false when omitted")
	}
}

func TestLoadFromDataDirUsesGenericProviderFallbackFields(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "providerFormat": "anthropic",
  "providerBaseURL": "https://api.anthropic.com/v1",
  "providerApiKey": "anthropic-key",
  "providerModel": "claude-sonnet-4-20250514",
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

	if cfg.ProviderFormat != "anthropic" {
		t.Fatalf("expected generic fallback format to load, got %q", cfg.ProviderFormat)
	}
	if cfg.OpenAIBaseURL != "https://api.anthropic.com/v1" {
		t.Fatalf("expected generic fallback base URL to map to provider config, got %q", cfg.OpenAIBaseURL)
	}
	if cfg.OpenAIAPIKey != "anthropic-key" {
		t.Fatalf("expected generic fallback API key to map to provider config, got %q", cfg.OpenAIAPIKey)
	}
	if cfg.Model != "claude-sonnet-4-20250514" {
		t.Fatalf("expected generic fallback model to map to provider config, got %q", cfg.Model)
	}
}

func TestLoadFromDataDirMigratesManagedAbsolutePathsIntoCurrentDataDir(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "sqlitePath": "/home/elaina/workspace/AICoding/ReactGo/Project01/data/aichat.db",
  "uploadDir": "/home/elaina/workspace/AICoding/ReactGo/Project01/data/uploads",
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

	if cfg.SQLitePath != filepath.Join(dataDir, defaultSQLiteFileName) {
		t.Fatalf("expected sqlite path to migrate into current data dir, got %q", cfg.SQLitePath)
	}
	if cfg.UploadDir != filepath.Join(dataDir, defaultUploadDirName) {
		t.Fatalf("expected upload dir to migrate into current data dir, got %q", cfg.UploadDir)
	}

	payload, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config file: %v", err)
	}
	if !strings.Contains(string(payload), `"sqlitePath": "aichat.db"`) {
		t.Fatalf("expected sqlite path to be rewritten as portable relative path, got %s", string(payload))
	}
	if !strings.Contains(string(payload), `"uploadDir": "uploads"`) {
		t.Fatalf("expected upload dir to be rewritten as portable relative path, got %s", string(payload))
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
	if !strings.Contains(string(payload), `"trustProxyHeadersForSecureCookies": false`) {
		t.Fatalf("expected trust proxy headers flag to be persisted, got %s", string(payload))
	}
}

func TestLoadFromDataDirMigratesLegacyBundledRAGAPIKey(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "ragBaseURL": "https://api.siliconflow.cn/v1",
  "ragApiKey": "` + legacyBundledRAGAPIKey + `",
  "ragEmbeddingModel": "embed-model",
  "ragRerankerModel": "rerank-model"
}
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	cfg, err := loadFromDataDir(dataDir)
	if err != nil {
		t.Fatalf("loadFromDataDir() error = %v", err)
	}

	if cfg.RAGAPIKey != "" {
		t.Fatalf("expected legacy bundled RAG API key to be cleared, got %q", cfg.RAGAPIKey)
	}

	payload, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config file: %v", err)
	}
	if strings.Contains(string(payload), `"ragApiKey"`) {
		t.Fatalf("expected migrated config file to omit ragApiKey, got %s", string(payload))
	}
}

func TestLoadFromDataDirPreservesCustomRAGAPIKey(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "ragBaseURL": "https://api.siliconflow.cn/v1",
  "ragApiKey": "custom-rag-key",
  "ragEmbeddingModel": "embed-model",
  "ragRerankerModel": "rerank-model"
}
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	cfg, err := loadFromDataDir(dataDir)
	if err != nil {
		t.Fatalf("loadFromDataDir() error = %v", err)
	}

	if cfg.RAGAPIKey != "custom-rag-key" {
		t.Fatalf("expected custom RAG API key to be preserved, got %q", cfg.RAGAPIKey)
	}
}

func TestLoadFromDataDirLoadsTrustedProxyCookieFlag(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	configPath := filepath.Join(dataDir, defaultConfigFileName)
	content := `{
  "trustProxyHeadersForSecureCookies": true
}
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	cfg, err := loadFromDataDir(dataDir)
	if err != nil {
		t.Fatalf("loadFromDataDir() error = %v", err)
	}

	if !cfg.TrustProxyHeadersForSecureCookies {
		t.Fatal("expected trust proxy headers for secure cookies to load from config")
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
