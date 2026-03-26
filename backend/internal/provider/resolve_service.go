package provider

import (
	"errors"
	"fmt"

	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/gorm"
)

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
