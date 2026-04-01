package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	defaultAppEnv            = "production"
	defaultServerPort        = "5721"
	defaultConfigFileName    = "app.json"
	defaultSQLiteFileName    = "aichat.db"
	defaultUploadDirName     = "uploads"
	defaultRAGBaseURL        = "https://api.siliconflow.cn/v1"
	defaultRAGEmbeddingModel = "Qwen/Qwen3-Embedding-8B"
	defaultRAGRerankerModel  = "Qwen/Qwen3-Reranker-8B"
	legacyBundledRAGAPIKey   = "sk-oaoecvjushohmbfrfxohqctsgzrqggsvisrlzvisfwjhyunh"
)

type Config struct {
	AppEnv                            string
	ProviderFormat                    string
	OpenAIBaseURL                     string
	OpenAIAPIKey                      string
	Model                             string
	RAGBaseURL                        string
	RAGAPIKey                         string
	RAGEmbeddingModel                 string
	RAGRerankerModel                  string
	SQLitePath                        string
	UploadDir                         string
	ServerPort                        string
	SessionSecret                     string
	SettingsEncryptionKey             string
	TrustProxyHeadersForSecureCookies bool
	BootstrapUsername                 string
	BootstrapPassword                 string
}

type fileConfig struct {
	AppEnv                            string `json:"appEnv,omitempty"`
	ProviderFormat                    string `json:"providerFormat,omitempty"`
	ProviderBaseURL                   string `json:"providerBaseURL,omitempty"`
	ProviderAPIKey                    string `json:"providerApiKey,omitempty"`
	ProviderModel                     string `json:"providerModel,omitempty"`
	OpenAIBaseURL                     string `json:"openAIBaseURL,omitempty"`
	OpenAIAPIKey                      string `json:"openAIApiKey,omitempty"`
	Model                             string `json:"model,omitempty"`
	RAGBaseURL                        string `json:"ragBaseURL,omitempty"`
	RAGAPIKey                         string `json:"ragApiKey,omitempty"`
	RAGEmbeddingModel                 string `json:"ragEmbeddingModel,omitempty"`
	RAGRerankerModel                  string `json:"ragRerankerModel,omitempty"`
	SQLitePath                        string `json:"sqlitePath,omitempty"`
	UploadDir                         string `json:"uploadDir,omitempty"`
	ServerPort                        string `json:"serverPort,omitempty"`
	SessionSecret                     string `json:"sessionSecret,omitempty"`
	SettingsEncryptionKey             string `json:"settingsEncryptionKey,omitempty"`
	TrustProxyHeadersForSecureCookies bool   `json:"trustProxyHeadersForSecureCookies"`
	BootstrapUsername                 string `json:"bootstrapUsername,omitempty"`
	BootstrapPassword                 string `json:"bootstrapPassword,omitempty"`
}

func Load() (*Config, error) {
	dataDir, err := resolveDataDir()
	if err != nil {
		return nil, err
	}

	return loadFromDataDir(dataDir)
}

func loadFromDataDir(dataDir string) (*Config, error) {
	absoluteDataDir, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, fmt.Errorf("resolve data dir: %w", err)
	}

	if err := os.MkdirAll(absoluteDataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	configPath := filepath.Join(absoluteDataDir, defaultConfigFileName)
	raw, existed, err := readFileConfig(configPath)
	if err != nil {
		return nil, err
	}

	normalized, changed, err := normalizeFileConfig(raw, absoluteDataDir)
	if err != nil {
		return nil, err
	}

	if !existed || changed {
		if err := writeFileConfig(configPath, normalized); err != nil {
			return nil, err
		}
	}

	cfg := &Config{
		AppEnv:                            normalized.AppEnv,
		ProviderFormat:                    normalized.ProviderFormat,
		OpenAIBaseURL:                     normalized.OpenAIBaseURL,
		OpenAIAPIKey:                      normalized.OpenAIAPIKey,
		Model:                             normalized.Model,
		RAGBaseURL:                        normalized.RAGBaseURL,
		RAGAPIKey:                         normalized.RAGAPIKey,
		RAGEmbeddingModel:                 normalized.RAGEmbeddingModel,
		RAGRerankerModel:                  normalized.RAGRerankerModel,
		SQLitePath:                        resolveConfiguredPath(normalized.SQLitePath, defaultSQLiteFileName, absoluteDataDir),
		UploadDir:                         resolveConfiguredPath(normalized.UploadDir, defaultUploadDirName, absoluteDataDir),
		ServerPort:                        normalized.ServerPort,
		SessionSecret:                     normalized.SessionSecret,
		SettingsEncryptionKey:             normalized.SettingsEncryptionKey,
		TrustProxyHeadersForSecureCookies: normalized.TrustProxyHeadersForSecureCookies,
		BootstrapUsername:                 normalized.BootstrapUsername,
		BootstrapPassword:                 normalized.BootstrapPassword,
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) validate() error {
	if (c.BootstrapUsername == "") != (c.BootstrapPassword == "") {
		return fmt.Errorf("bootstrap username and password must be provided together")
	}

	return nil
}

func normalizeFileConfig(raw fileConfig, dataDir string) (fileConfig, bool, error) {
	normalized := fileConfig{
		AppEnv:                            strings.TrimSpace(raw.AppEnv),
		ProviderFormat:                    strings.TrimSpace(raw.ProviderFormat),
		ProviderBaseURL:                   strings.TrimSpace(raw.ProviderBaseURL),
		ProviderAPIKey:                    strings.TrimSpace(raw.ProviderAPIKey),
		ProviderModel:                     strings.TrimSpace(raw.ProviderModel),
		OpenAIBaseURL:                     strings.TrimSpace(raw.OpenAIBaseURL),
		OpenAIAPIKey:                      strings.TrimSpace(raw.OpenAIAPIKey),
		Model:                             strings.TrimSpace(raw.Model),
		RAGBaseURL:                        strings.TrimSpace(raw.RAGBaseURL),
		RAGAPIKey:                         strings.TrimSpace(raw.RAGAPIKey),
		RAGEmbeddingModel:                 strings.TrimSpace(raw.RAGEmbeddingModel),
		RAGRerankerModel:                  strings.TrimSpace(raw.RAGRerankerModel),
		SQLitePath:                        strings.TrimSpace(raw.SQLitePath),
		UploadDir:                         strings.TrimSpace(raw.UploadDir),
		ServerPort:                        strings.TrimSpace(raw.ServerPort),
		SessionSecret:                     strings.TrimSpace(raw.SessionSecret),
		SettingsEncryptionKey:             strings.TrimSpace(raw.SettingsEncryptionKey),
		TrustProxyHeadersForSecureCookies: raw.TrustProxyHeadersForSecureCookies,
		BootstrapUsername:                 strings.TrimSpace(raw.BootstrapUsername),
		BootstrapPassword:                 strings.TrimSpace(raw.BootstrapPassword),
	}

	if normalized.RAGAPIKey == legacyBundledRAGAPIKey {
		normalized.RAGAPIKey = ""
	}

	if normalized.AppEnv == "" {
		normalized.AppEnv = defaultAppEnv
	}
	if normalized.ProviderFormat == "" {
		normalized.ProviderFormat = "openai"
	}
	if normalized.ProviderBaseURL == "" {
		normalized.ProviderBaseURL = normalized.OpenAIBaseURL
	}
	if normalized.ProviderAPIKey == "" {
		normalized.ProviderAPIKey = normalized.OpenAIAPIKey
	}
	if normalized.ProviderModel == "" {
		normalized.ProviderModel = normalized.Model
	}
	normalized.OpenAIBaseURL = normalized.ProviderBaseURL
	normalized.OpenAIAPIKey = normalized.ProviderAPIKey
	normalized.Model = normalized.ProviderModel
	if normalized.ServerPort == "" {
		normalized.ServerPort = defaultServerPort
	}
	if normalized.RAGBaseURL == "" {
		normalized.RAGBaseURL = defaultRAGBaseURL
	}
	if normalized.RAGEmbeddingModel == "" {
		normalized.RAGEmbeddingModel = defaultRAGEmbeddingModel
	}
	if normalized.RAGRerankerModel == "" {
		normalized.RAGRerankerModel = defaultRAGRerankerModel
	}

	normalized.SQLitePath = normalizePathForStorage(normalized.SQLitePath, defaultSQLiteFileName, dataDir)
	normalized.UploadDir = normalizePathForStorage(normalized.UploadDir, defaultUploadDirName, dataDir)

	if normalized.SessionSecret == "" {
		secret, err := generateSecret()
		if err != nil {
			return fileConfig{}, false, fmt.Errorf("generate session secret: %w", err)
		}
		normalized.SessionSecret = secret
	}

	if normalized.SettingsEncryptionKey == "" {
		secret, err := generateSecret()
		if err != nil {
			return fileConfig{}, false, fmt.Errorf("generate settings encryption key: %w", err)
		}
		normalized.SettingsEncryptionKey = secret
	}

	return normalized, normalized != raw, nil
}

func normalizePath(value string, fallback string, dataDir string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return filepath.Clean(fallback)
	}
	if filepath.IsAbs(trimmed) {
		return filepath.Clean(trimmed)
	}

	return filepath.Clean(filepath.Join(dataDir, trimmed))
}

func resolveConfiguredPath(value string, defaultName string, dataDir string) string {
	return normalizePath(value, filepath.Join(dataDir, defaultName), dataDir)
}

func normalizePathForStorage(value string, defaultName string, dataDir string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return defaultName
	}
	if !filepath.IsAbs(trimmed) {
		return filepath.Clean(trimmed)
	}

	cleaned := filepath.Clean(trimmed)
	defaultPath := filepath.Join(dataDir, defaultName)
	if cleaned == filepath.Clean(defaultPath) {
		return defaultName
	}
	if filepath.Base(cleaned) == filepath.Base(defaultName) &&
		filepath.Base(filepath.Dir(cleaned)) == filepath.Base(dataDir) {
		return defaultName
	}

	return cleaned
}

func readFileConfig(configPath string) (fileConfig, bool, error) {
	payload, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fileConfig{}, false, nil
		}
		return fileConfig{}, false, fmt.Errorf("read config file: %w", err)
	}

	var cfg fileConfig
	if err := json.Unmarshal(payload, &cfg); err != nil {
		return fileConfig{}, false, fmt.Errorf("decode config file: %w", err)
	}

	return cfg, true, nil
}

func writeFileConfig(configPath string, cfg fileConfig) error {
	payload, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config file: %w", err)
	}
	payload = append(payload, '\n')

	tempPath := configPath + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o644); err != nil {
		return fmt.Errorf("write config file: %w", err)
	}

	if err := os.Rename(tempPath, configPath); err != nil {
		return fmt.Errorf("replace config file: %w", err)
	}

	return nil
}

func resolveDataDir() (string, error) {
	repoDataDir, ok, err := findRepoDataDir()
	if err != nil {
		return "", err
	}
	if ok {
		return repoDataDir, nil
	}

	if stat, err := os.Stat("/data"); err == nil && stat.IsDir() {
		return "/data", nil
	}

	workingDir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}

	if filepath.Base(workingDir) == "backend" {
		return filepath.Join(filepath.Dir(workingDir), "data"), nil
	}

	return filepath.Join(workingDir, "data"), nil
}

func findRepoDataDir() (string, bool, error) {
	workingDir, err := os.Getwd()
	if err != nil {
		return "", false, fmt.Errorf("get working directory: %w", err)
	}

	current := workingDir
	for {
		if fileExists(filepath.Join(current, "docker-compose.yml")) &&
			fileExists(filepath.Join(current, "backend", "go.mod")) {
			return filepath.Join(current, "data"), true, nil
		}

		parent := filepath.Dir(current)
		if parent == current {
			return "", false, nil
		}
		current = parent
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func generateSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	return hex.EncodeToString(buf), nil
}
