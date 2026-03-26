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
	"time"

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
	DefaultModel string
}

type UpdatePresetInput struct {
	Name         *string
	BaseURL      *string
	APIKey       *string
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

func (s *Service) ListState(userID uint) (*State, error) {
	var presets []models.LLMProviderPreset
	if err := s.db.
		Where("user_id = ?", userID).
		Order("is_active desc").
		Order("updated_at desc").
		Find(&presets).Error; err != nil {
		return nil, fmt.Errorf("list provider presets: %w", err)
	}

	state := &State{
		Presets:       presets,
		CurrentSource: SourceNone,
		Fallback:      s.fallbackState(),
	}

	for index := range presets {
		if !presets[index].IsActive {
			continue
		}
		activePresetID := presets[index].ID
		state.ActivePresetID = &activePresetID
		state.CurrentSource = SourcePreset
		break
	}

	if state.CurrentSource == SourceNone && state.Fallback.Available {
		state.CurrentSource = SourceFallback
	}

	return state, nil
}

func (s *Service) CreatePreset(userID uint, input CreatePresetInput) (*models.LLMProviderPreset, error) {
	normalized, err := sanitizeCreatePresetInput(input)
	if err != nil {
		return nil, err
	}

	encryptedAPIKey, err := s.crypter.Encrypt(normalized.APIKey)
	if err != nil {
		return nil, fmt.Errorf("encrypt provider API key: %w", err)
	}

	preset := &models.LLMProviderPreset{
		UserID:          userID,
		Name:            normalized.Name,
		BaseURL:         normalized.BaseURL,
		EncryptedAPIKey: encryptedAPIKey,
		APIKeyHint:      apiKeyHint(normalized.APIKey),
		DefaultModel:    normalized.DefaultModel,
		IsActive:        true,
	}

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.LLMProviderPreset{}).
			Where("user_id = ?", userID).
			Update("is_active", false).Error; err != nil {
			return fmt.Errorf("deactivate existing provider presets: %w", err)
		}

		if err := tx.Create(preset).Error; err != nil {
			return fmt.Errorf("create provider preset: %w", err)
		}

		return nil
	}); err != nil {
		return nil, err
	}

	return preset, nil
}

func (s *Service) UpdatePreset(userID uint, presetID uint, input UpdatePresetInput) (*models.LLMProviderPreset, error) {
	preset, err := s.getPreset(userID, presetID)
	if err != nil {
		return nil, err
	}

	normalized, err := sanitizeUpdatePresetInput(input)
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"updated_at": time.Now(),
	}

	if normalized.Name != nil {
		updates["name"] = *normalized.Name
	}
	if normalized.BaseURL != nil {
		updates["base_url"] = *normalized.BaseURL
	}
	if normalized.DefaultModel != nil {
		updates["default_model"] = *normalized.DefaultModel
	}
	if normalized.APIKey != nil {
		encryptedAPIKey, err := s.crypter.Encrypt(*normalized.APIKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt provider API key: %w", err)
		}
		updates["encrypted_api_key"] = encryptedAPIKey
		updates["api_key_hint"] = apiKeyHint(*normalized.APIKey)
	}

	if len(updates) > 1 {
		if err := s.db.Model(preset).Updates(updates).Error; err != nil {
			return nil, fmt.Errorf("update provider preset: %w", err)
		}
	}

	return s.getPreset(userID, presetID)
}

func (s *Service) ActivatePreset(userID uint, presetID uint) (*models.LLMProviderPreset, error) {
	if _, err := s.getPreset(userID, presetID); err != nil {
		return nil, err
	}

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.LLMProviderPreset{}).
			Where("user_id = ?", userID).
			Update("is_active", false).Error; err != nil {
			return fmt.Errorf("deactivate provider presets: %w", err)
		}

		result := tx.Model(&models.LLMProviderPreset{}).
			Where("id = ? AND user_id = ?", presetID, userID).
			Update("is_active", true)
		if result.Error != nil {
			return fmt.Errorf("activate provider preset: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return nil
	}); err != nil {
		return nil, err
	}

	return s.getPreset(userID, presetID)
}

func (s *Service) DeletePreset(userID uint, presetID uint) error {
	preset, err := s.getPreset(userID, presetID)
	if err != nil {
		return err
	}

	if err := s.db.Delete(preset).Error; err != nil {
		return fmt.Errorf("delete provider preset: %w", err)
	}

	return nil
}

func (s *Service) TestPreset(ctx context.Context, userID uint, input TestPresetInput) (*TestResult, error) {
	if s.tester == nil {
		return nil, requestError{message: "provider tester is unavailable"}
	}

	resolved, err := s.resolveTestConfig(userID, input)
	if err != nil {
		return nil, err
	}

	testCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	if err := s.tester.Test(testCtx, resolved); err != nil {
		return nil, requestError{message: "provider connection test failed: " + err.Error()}
	}

	return &TestResult{
		OK:              true,
		Message:         "provider connection verified",
		ResolvedBaseURL: resolved.BaseURL,
		ResolvedModel:   resolved.DefaultModel,
	}, nil
}

func (s *Service) ResolveForUser(userID uint) (*ResolvedProvider, error) {
	preset, err := s.activePreset(userID)
	if err != nil {
		return nil, err
	}
	if preset != nil {
		apiKey, err := s.crypter.Decrypt(preset.EncryptedAPIKey)
		if err != nil {
			return nil, fmt.Errorf("decrypt provider API key: %w", err)
		}

		activePresetID := preset.ID
		return &ResolvedProvider{
			Source:         SourcePreset,
			ActivePresetID: &activePresetID,
			Name:           preset.Name,
			Config: llm.ProviderConfig{
				BaseURL:      preset.BaseURL,
				APIKey:       apiKey,
				DefaultModel: preset.DefaultModel,
			},
		}, nil
	}

	if isCompleteProviderConfig(s.fallback) {
		return &ResolvedProvider{
			Source: SourceFallback,
			Config: s.fallback,
		}, nil
	}

	return nil, ErrNoProviderConfigured
}

func (s *Service) getPreset(userID uint, presetID uint) (*models.LLMProviderPreset, error) {
	var preset models.LLMProviderPreset
	if err := s.db.
		Where("id = ? AND user_id = ?", presetID, userID).
		First(&preset).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, fmt.Errorf("get provider preset: %w", err)
	}

	return &preset, nil
}

func (s *Service) activePreset(userID uint) (*models.LLMProviderPreset, error) {
	var preset models.LLMProviderPreset
	err := s.db.
		Where("user_id = ? AND is_active = ?", userID, true).
		Order("updated_at desc").
		First(&preset).Error
	if err == nil {
		return &preset, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return nil, fmt.Errorf("get active provider preset: %w", err)
}

func (s *Service) fallbackState() FallbackState {
	return FallbackState{
		Available:    isCompleteProviderConfig(s.fallback),
		BaseURL:      s.fallback.BaseURL,
		DefaultModel: s.fallback.DefaultModel,
	}
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

	defaultModel := strings.TrimSpace(input.DefaultModel)
	if defaultModel == "" {
		return CreatePresetInput{}, requestError{message: "provider model is required"}
	}

	return CreatePresetInput{
		Name:         name,
		BaseURL:      baseURL,
		APIKey:       apiKey,
		DefaultModel: defaultModel,
	}, nil
}

func sanitizeUpdatePresetInput(input UpdatePresetInput) (UpdatePresetInput, error) {
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

	if input.DefaultModel != nil {
		defaultModel := strings.TrimSpace(*input.DefaultModel)
		if defaultModel == "" {
			return UpdatePresetInput{}, requestError{message: "provider model is required"}
		}
		normalized.DefaultModel = &defaultModel
	}

	return normalized, nil
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
