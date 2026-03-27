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
	defaultAppEnv         = "production"
	defaultServerPort     = "5721"
	defaultConfigFileName = "app.json"
	defaultSQLiteFileName = "aichat.db"
	defaultUploadDirName  = "uploads"
)

type Config struct {
	AppEnv                string
	OpenAIBaseURL         string
	OpenAIAPIKey          string
	Model                 string
	SQLitePath            string
	UploadDir             string
	ServerPort            string
	SessionSecret         string
	SettingsEncryptionKey string
	TrustProxyHeadersForSecureCookies bool
	BootstrapUsername     string
	BootstrapPassword     string
}

type fileConfig struct {
	AppEnv                string `json:"appEnv,omitempty"`
	OpenAIBaseURL         string `json:"openAIBaseURL,omitempty"`
	OpenAIAPIKey          string `json:"openAIApiKey,omitempty"`
	Model                 string `json:"model,omitempty"`
	SQLitePath            string `json:"sqlitePath,omitempty"`
	UploadDir             string `json:"uploadDir,omitempty"`
	ServerPort            string `json:"serverPort,omitempty"`
	SessionSecret         string `json:"sessionSecret,omitempty"`
	SettingsEncryptionKey string `json:"settingsEncryptionKey,omitempty"`
	TrustProxyHeadersForSecureCookies bool `json:"trustProxyHeadersForSecureCookies"`
	BootstrapUsername     string `json:"bootstrapUsername,omitempty"`
	BootstrapPassword     string `json:"bootstrapPassword,omitempty"`
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
		AppEnv:                normalized.AppEnv,
		OpenAIBaseURL:         normalized.OpenAIBaseURL,
		OpenAIAPIKey:          normalized.OpenAIAPIKey,
		Model:                 normalized.Model,
		SQLitePath:            normalized.SQLitePath,
		UploadDir:             normalized.UploadDir,
		ServerPort:            normalized.ServerPort,
		SessionSecret:         normalized.SessionSecret,
		SettingsEncryptionKey: normalized.SettingsEncryptionKey,
		TrustProxyHeadersForSecureCookies: normalized.TrustProxyHeadersForSecureCookies,
		BootstrapUsername:     normalized.BootstrapUsername,
		BootstrapPassword:     normalized.BootstrapPassword,
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
		AppEnv:                strings.TrimSpace(raw.AppEnv),
		OpenAIBaseURL:         strings.TrimSpace(raw.OpenAIBaseURL),
		OpenAIAPIKey:          strings.TrimSpace(raw.OpenAIAPIKey),
		Model:                 strings.TrimSpace(raw.Model),
		SQLitePath:            strings.TrimSpace(raw.SQLitePath),
		UploadDir:             strings.TrimSpace(raw.UploadDir),
		ServerPort:            strings.TrimSpace(raw.ServerPort),
		SessionSecret:         strings.TrimSpace(raw.SessionSecret),
		SettingsEncryptionKey: strings.TrimSpace(raw.SettingsEncryptionKey),
		TrustProxyHeadersForSecureCookies: raw.TrustProxyHeadersForSecureCookies,
		BootstrapUsername:     strings.TrimSpace(raw.BootstrapUsername),
		BootstrapPassword:     strings.TrimSpace(raw.BootstrapPassword),
	}

	if normalized.AppEnv == "" {
		normalized.AppEnv = defaultAppEnv
	}
	if normalized.ServerPort == "" {
		normalized.ServerPort = defaultServerPort
	}

	defaultSQLitePath := filepath.Join(dataDir, defaultSQLiteFileName)
	normalized.SQLitePath = normalizePath(normalized.SQLitePath, defaultSQLitePath, dataDir)

	defaultUploadDir := filepath.Join(dataDir, defaultUploadDirName)
	normalized.UploadDir = normalizePath(normalized.UploadDir, defaultUploadDir, dataDir)

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
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
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
