package provider

import (
	"context"
	"errors"
	"strings"

	"backend/internal/config"
	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/gorm"
)

const (
	SourcePreset   = "preset"
	SourceFallback = "fallback"
	SourceNone     = "none"
)

var ErrNoProviderConfigured = errors.New("no AI provider configured")

type requestError struct {
	message string
}

func (e requestError) Error() string {
	return e.message
}

func IsRequestError(err error) bool {
	var target requestError
	return errors.As(err, &target)
}

type FallbackState struct {
	Available    bool
	Format       string
	BaseURL      string
	Models       []string
	DefaultModel string
}

type State struct {
	Presets        []models.LLMProviderPreset
	ActivePresetID *uint
	CurrentSource  string
	Fallback       FallbackState
}

type CreatePresetInput struct {
	Format            string
	Name              string
	BaseURL           string
	APIKey            string
	ReuseActiveAPIKey bool
	Models            []string
	DefaultModel      string
}

type UpdatePresetInput struct {
	Format       *string
	Name         *string
	BaseURL      *string
	APIKey       *string
	Models       *[]string
	DefaultModel *string
}

type ResolvedProvider struct {
	Source         string
	ActivePresetID *uint
	Name           string
	Config         llm.ProviderConfig
}

type TestPresetInput struct {
	PresetID          *uint
	Format            string
	BaseURL           string
	APIKey            string
	ReuseActiveAPIKey bool
	DefaultModel      string
}

type TestResult struct {
	OK              bool
	Message         string
	ResolvedBaseURL string
	ResolvedModel   string
}

type Service struct {
	db       *gorm.DB
	fallback llm.ProviderConfig
	crypter  *apiKeyCrypter
	tester   providerTester
}

type providerTester interface {
	Test(context.Context, llm.ProviderConfig) error
}

func NewService(db *gorm.DB, cfg *config.Config, tester providerTester) (*Service, error) {
	encryptionSecret := strings.TrimSpace(cfg.SettingsEncryptionKey)
	if encryptionSecret == "" {
		encryptionSecret = strings.TrimSpace(cfg.SessionSecret)
	}

	crypter, err := newAPIKeyCrypter(encryptionSecret)
	if err != nil {
		return nil, err
	}

	return &Service{
		db: db,
		fallback: llm.ProviderConfig{
			Format:       normalizeProviderFormat(cfg.ProviderFormat),
			BaseURL:      normalizeBaseURL(cfg.OpenAIBaseURL),
			APIKey:       strings.TrimSpace(cfg.OpenAIAPIKey),
			DefaultModel: strings.TrimSpace(cfg.Model),
		},
		crypter: crypter,
		tester:  tester,
	}, nil
}
