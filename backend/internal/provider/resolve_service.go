package provider

import (
	"errors"
	"fmt"
	"strings"

	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) ResolveForUser(userID uint, preferredPresetID *uint) (*ResolvedProvider, error) {
	preset, err := s.resolvePresetForUser(userID, preferredPresetID)
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

func (s *Service) resolvePresetForUser(userID uint, preferredPresetID *uint) (*models.LLMProviderPreset, error) {
	if preferredPresetID != nil && *preferredPresetID != 0 {
		return s.getPreset(userID, *preferredPresetID)
	}

	defaultPresetID, err := s.defaultProviderPresetID(userID)
	if err != nil {
		return nil, err
	}
	if defaultPresetID != nil {
		preset, err := s.getPreset(userID, *defaultPresetID)
		if err == nil {
			return preset, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	return s.activePreset(userID)
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

func (s *Service) defaultProviderPresetID(userID uint) (*uint, error) {
	var user models.User
	if err := s.db.
		Select("default_provider_preset_id").
		First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("get user default provider preset: %w", err)
	}

	if user.DefaultProviderPresetID == nil {
		return nil, nil
	}
	return cloneUint(user.DefaultProviderPresetID), nil
}

func (s *Service) resolveActivePresetAPIKey(userID uint) (string, error) {
	preset, err := s.activePreset(userID)
	if err != nil {
		return "", err
	}
	if preset == nil || strings.TrimSpace(preset.EncryptedAPIKey) == "" {
		return "", requestError{message: "active provider API key is unavailable"}
	}

	apiKey, err := s.crypter.Decrypt(preset.EncryptedAPIKey)
	if err != nil {
		return "", fmt.Errorf("decrypt provider API key: %w", err)
	}
	if strings.TrimSpace(apiKey) == "" {
		return "", requestError{message: "active provider API key is unavailable"}
	}

	return apiKey, nil
}

func (s *Service) fallbackState() FallbackState {
	fallbackModels := []string{}
	if strings.TrimSpace(s.fallback.DefaultModel) != "" {
		fallbackModels = []string{s.fallback.DefaultModel}
	}

	return FallbackState{
		Available:    isCompleteProviderConfig(s.fallback),
		BaseURL:      s.fallback.BaseURL,
		Models:       fallbackModels,
		DefaultModel: s.fallback.DefaultModel,
	}
}

func cloneUint(value *uint) *uint {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
