package provider

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/url"
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
	Name         string
	BaseURL      string
	APIKey       string
	Models       []string
	DefaultModel string
}

type UpdatePresetInput struct {
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
	PresetID     *uint
	BaseURL      string
	APIKey       string
	DefaultModel string
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
			BaseURL:      normalizeBaseURL(cfg.OpenAIBaseURL),
			APIKey:       strings.TrimSpace(cfg.OpenAIAPIKey),
			DefaultModel: strings.TrimSpace(cfg.Model),
		},
		crypter: crypter,
		tester:  tester,
	}, nil
}

func isCompleteProviderConfig(provider llm.ProviderConfig) bool {
	return strings.TrimSpace(provider.BaseURL) != "" &&
		strings.TrimSpace(provider.APIKey) != "" &&
		strings.TrimSpace(provider.DefaultModel) != ""
}

func sanitizeCreatePresetInput(input CreatePresetInput) (CreatePresetInput, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return CreatePresetInput{}, requestError{message: "provider name is required"}
	}

	baseURL := normalizeBaseURL(input.BaseURL)
	if baseURL == "" {
		return CreatePresetInput{}, requestError{message: "provider base URL is required"}
	}

	apiKey := strings.TrimSpace(input.APIKey)
	if apiKey == "" {
		return CreatePresetInput{}, requestError{message: "provider API key is required"}
	}

	models, defaultModel, err := normalizeProviderModels(
		input.Models,
		input.DefaultModel,
	)
	if err != nil {
		return CreatePresetInput{}, err
	}

	return CreatePresetInput{
		Name:         name,
		BaseURL:      baseURL,
		APIKey:       apiKey,
		Models:       models,
		DefaultModel: defaultModel,
	}, nil
}

func sanitizeUpdatePresetInput(
	input UpdatePresetInput,
	current *models.LLMProviderPreset,
) (UpdatePresetInput, error) {
	var normalized UpdatePresetInput

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return UpdatePresetInput{}, requestError{message: "provider name is required"}
		}
		normalized.Name = &name
	}

	if input.BaseURL != nil {
		baseURL := normalizeBaseURL(*input.BaseURL)
		if baseURL == "" {
			return UpdatePresetInput{}, requestError{message: "provider base URL is required"}
		}
		normalized.BaseURL = &baseURL
	}

	if input.APIKey != nil {
		apiKey := strings.TrimSpace(*input.APIKey)
		if apiKey == "" {
			return UpdatePresetInput{}, requestError{message: "provider API key is required"}
		}
		normalized.APIKey = &apiKey
	}

	if input.Models != nil || input.DefaultModel != nil {
		nextModels := currentProviderModels(current)
		if input.Models != nil {
			nextModels = *input.Models
		}

		nextDefaultModel := current.DefaultModel
		if input.DefaultModel != nil {
			nextDefaultModel = *input.DefaultModel
		}

		models, defaultModel, err := normalizeProviderModels(
			nextModels,
			nextDefaultModel,
		)
		if err != nil {
			return UpdatePresetInput{}, err
		}

		normalized.Models = &models
		normalized.DefaultModel = &defaultModel
	}

	return normalized, nil
}

func normalizeProviderModels(
	models []string,
	defaultModel string,
) ([]string, string, error) {
	normalizedDefaultModel := strings.TrimSpace(defaultModel)
	if normalizedDefaultModel == "" {
		return nil, "", requestError{message: "provider model is required"}
	}

	normalizedModels := uniqueModels(models)
	if !containsModel(normalizedModels, normalizedDefaultModel) {
		normalizedModels = append([]string{normalizedDefaultModel}, normalizedModels...)
	}
	if len(normalizedModels) == 0 {
		normalizedModels = []string{normalizedDefaultModel}
	}

	return normalizedModels, normalizedDefaultModel, nil
}

func uniqueModels(models []string) []string {
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(models))

	for _, model := range models {
		trimmed := strings.TrimSpace(model)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	return normalized
}

func containsModel(models []string, target string) bool {
	normalizedTarget := strings.TrimSpace(target)
	if normalizedTarget == "" {
		return false
	}

	for _, model := range models {
		if strings.TrimSpace(model) == normalizedTarget {
			return true
		}
	}

	return false
}

func currentProviderModels(preset *models.LLMProviderPreset) []string {
	models := uniqueModels(preset.Models)
	defaultModel := strings.TrimSpace(preset.DefaultModel)

	if defaultModel == "" {
		return models
	}
	if len(models) == 0 {
		return []string{defaultModel}
	}
	if containsModel(models, defaultModel) {
		return models
	}

	return append([]string{defaultModel}, models...)
}

func normalizeBaseURL(value string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(value), "/")
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}

	return parsed.String()
}

func apiKeyHint(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	runes := []rune(trimmed)
	if len(runes) <= 8 {
		return string(runes[0]) + "***" + string(runes[len(runes)-1])
	}

	return string(runes[:4]) + "..." + string(runes[len(runes)-4:])
}

type apiKeyCrypter struct {
	gcm cipher.AEAD
}

func newAPIKeyCrypter(secret string) (*apiKeyCrypter, error) {
	normalizedSecret := strings.TrimSpace(secret)
	if normalizedSecret == "" {
		return nil, errors.New("settings encryption secret is required")
	}

	key := sha256.Sum256([]byte(normalizedSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM cipher: %w", err)
	}

	return &apiKeyCrypter{gcm: gcm}, nil
}

func (c *apiKeyCrypter) Encrypt(value string) (string, error) {
	nonce := make([]byte, c.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := c.gcm.Seal(nil, nonce, []byte(value), nil)
	payload := append(nonce, ciphertext...)
	return base64.StdEncoding.EncodeToString(payload), nil
}

func (c *apiKeyCrypter) Decrypt(value string) (string, error) {
	payload, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	nonceSize := c.gcm.NonceSize()
	if len(payload) < nonceSize {
		return "", errors.New("ciphertext is too short")
	}

	nonce := payload[:nonceSize]
	ciphertext := payload[nonceSize:]
	plaintext, err := c.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt ciphertext: %w", err)
	}

	return string(plaintext), nil
}

func (s *Service) resolveTestConfig(userID uint, input TestPresetInput) (llm.ProviderConfig, error) {
	baseURL := strings.TrimSpace(input.BaseURL)
	apiKey := strings.TrimSpace(input.APIKey)
	defaultModel := strings.TrimSpace(input.DefaultModel)

	if input.PresetID != nil {
		preset, err := s.getPreset(userID, *input.PresetID)
		if err != nil {
			return llm.ProviderConfig{}, err
		}

		if baseURL == "" {
			baseURL = preset.BaseURL
		}
		if defaultModel == "" {
			defaultModel = preset.DefaultModel
		}
		if apiKey == "" {
			apiKey, err = s.crypter.Decrypt(preset.EncryptedAPIKey)
			if err != nil {
				return llm.ProviderConfig{}, fmt.Errorf("decrypt provider API key: %w", err)
			}
		}
	}

	normalized := normalizeBaseURL(baseURL)
	if normalized == "" {
		return llm.ProviderConfig{}, requestError{message: "provider base URL must be a valid http or https URL"}
	}
	if apiKey == "" {
		return llm.ProviderConfig{}, requestError{message: "provider API key is required"}
	}
	if defaultModel == "" {
		return llm.ProviderConfig{}, requestError{message: "provider model is required"}
	}

	return llm.ProviderConfig{
		BaseURL:      normalized,
		APIKey:       apiKey,
		DefaultModel: defaultModel,
	}, nil
}
