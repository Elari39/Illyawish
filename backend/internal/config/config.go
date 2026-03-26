package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

const (
	defaultSQLitePath            = "./data/aichat.db"
	defaultServerPort            = "5721"
	defaultSessionSecret         = "change-me-session-secret"
	defaultSettingsEncryptionKey = "change-me-settings-encryption-key"
	defaultFrontendOrigin        = "http://localhost:10170"
	defaultAppEnv                = "development"
	defaultUploadDir             = "./backend/data/uploads"
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
	FrontendOrigin        string
	BootstrapUsername     string
	BootstrapPassword     string
}

func Load() (*Config, error) {
	v := viper.New()
	v.SetConfigType("env")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	envPath, err := findEnvFile()
	if err != nil {
		return nil, err
	}
	if envPath != "" {
		v.SetConfigFile(envPath)
		if err := v.ReadInConfig(); err != nil {
			return nil, fmt.Errorf("read env file: %w", err)
		}
	}

	mustBindEnv(v, "openai_base_url", "OPENAI_BASE_URL")
	mustBindEnv(v, "openai_api_key", "OPENAI_API_KEY")
	mustBindEnv(v, "model", "MODEL")
	mustBindEnv(v, "app_env", "APP_ENV")
	mustBindEnv(v, "sqlite_path", "SQLITE_PATH")
	mustBindEnv(v, "upload_dir", "UPLOAD_DIR")
	mustBindEnv(v, "server_port", "SERVER_PORT")
	mustBindEnv(v, "session_secret", "SESSION_SECRET")
	mustBindEnv(v, "settings_encryption_key", "SETTINGS_ENCRYPTION_KEY")
	mustBindEnv(v, "frontend_origin", "FRONTEND_ORIGIN")
	mustBindEnv(v, "bootstrap_username", "BOOTSTRAP_USERNAME")
	mustBindEnv(v, "bootstrap_password", "BOOTSTRAP_PASSWORD")

	v.SetDefault("app_env", defaultAppEnv)
	v.SetDefault("sqlite_path", defaultSQLitePath)
	v.SetDefault("upload_dir", defaultUploadDir)
	v.SetDefault("server_port", defaultServerPort)
	v.SetDefault("session_secret", defaultSessionSecret)
	v.SetDefault("frontend_origin", defaultFrontendOrigin)

	cfg := &Config{
		AppEnv:                strings.TrimSpace(v.GetString("app_env")),
		OpenAIBaseURL:         strings.TrimSpace(v.GetString("openai_base_url")),
		OpenAIAPIKey:          strings.TrimSpace(v.GetString("openai_api_key")),
		Model:                 strings.TrimSpace(v.GetString("model")),
		SQLitePath:            strings.TrimSpace(v.GetString("sqlite_path")),
		UploadDir:             strings.TrimSpace(v.GetString("upload_dir")),
		ServerPort:            strings.TrimSpace(v.GetString("server_port")),
		SessionSecret:         strings.TrimSpace(v.GetString("session_secret")),
		SettingsEncryptionKey: strings.TrimSpace(v.GetString("settings_encryption_key")),
		FrontendOrigin:        strings.TrimSpace(v.GetString("frontend_origin")),
		BootstrapUsername:     strings.TrimSpace(v.GetString("bootstrap_username")),
		BootstrapPassword:     strings.TrimSpace(v.GetString("bootstrap_password")),
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

	if !c.IsProductionLike() {
		return nil
	}

	if isPlaceholderSecret(c.SessionSecret) {
		return fmt.Errorf("SESSION_SECRET must be set to a non-placeholder value when APP_ENV=%s", c.AppEnv)
	}

	encryptionSecret := c.SettingsEncryptionKey
	if strings.TrimSpace(encryptionSecret) == "" {
		encryptionSecret = c.SessionSecret
	}
	if isPlaceholderSecret(encryptionSecret) {
		return fmt.Errorf("SETTINGS_ENCRYPTION_KEY must be set to a non-placeholder value when APP_ENV=%s", c.AppEnv)
	}

	return nil
}

func (c *Config) IsProductionLike() bool {
	switch strings.ToLower(strings.TrimSpace(c.AppEnv)) {
	case "", "dev", "development", "local", "test":
		return false
	default:
		return true
	}
}

func isPlaceholderSecret(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return true
	}

	return trimmed == defaultSessionSecret || trimmed == defaultSettingsEncryptionKey
}

func findEnvFile() (string, error) {
	candidates := []string{
		".env",
		filepath.Join("..", ".env"),
		filepath.Join("..", "..", ".env"),
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			abs, err := filepath.Abs(candidate)
			if err != nil {
				return "", fmt.Errorf("resolve env path: %w", err)
			}
			return abs, nil
		}
	}

	return "", nil
}

func mustBindEnv(v *viper.Viper, key string, envKey string) {
	_ = v.BindEnv(key, envKey)
}
