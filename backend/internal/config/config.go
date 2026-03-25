package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	OpenAIBaseURL         string
	OpenAIAPIKey          string
	Model                 string
	SQLitePath            string
	ServerPort            string
	SessionSecret         string
	SettingsEncryptionKey string
	FrontendOrigin        string
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
	mustBindEnv(v, "sqlite_path", "SQLITE_PATH")
	mustBindEnv(v, "server_port", "SERVER_PORT")
	mustBindEnv(v, "session_secret", "SESSION_SECRET")
	mustBindEnv(v, "settings_encryption_key", "SETTINGS_ENCRYPTION_KEY")
	mustBindEnv(v, "frontend_origin", "FRONTEND_ORIGIN")

	v.SetDefault("sqlite_path", "./data/aichat.db")
	v.SetDefault("server_port", "8080")
	v.SetDefault("session_secret", "change-me-session-secret")
	v.SetDefault("frontend_origin", "http://localhost:5173")

	cfg := &Config{
		OpenAIBaseURL:         strings.TrimSpace(v.GetString("openai_base_url")),
		OpenAIAPIKey:          strings.TrimSpace(v.GetString("openai_api_key")),
		Model:                 strings.TrimSpace(v.GetString("model")),
		SQLitePath:            strings.TrimSpace(v.GetString("sqlite_path")),
		ServerPort:            strings.TrimSpace(v.GetString("server_port")),
		SessionSecret:         strings.TrimSpace(v.GetString("session_secret")),
		SettingsEncryptionKey: strings.TrimSpace(v.GetString("settings_encryption_key")),
		FrontendOrigin:        strings.TrimSpace(v.GetString("frontend_origin")),
	}

	return cfg, nil
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
