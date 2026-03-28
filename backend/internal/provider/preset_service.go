package provider

import (
	"context"
	"fmt"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

type providerPresetUpdates struct {
	Name            *string   `gorm:"column:name"`
	BaseURL         *string   `gorm:"column:base_url"`
	EncryptedAPIKey *string   `gorm:"column:encrypted_api_key"`
	APIKeyHint      *string   `gorm:"column:api_key_hint"`
	Models          []string  `gorm:"column:models;serializer:json"`
	DefaultModel    *string   `gorm:"column:default_model"`
	UpdatedAt       time.Time `gorm:"column:updated_at"`
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

	apiKey := normalized.APIKey
	if apiKey == "" && normalized.ReuseActiveAPIKey {
		apiKey, err = s.resolveActivePresetAPIKey(userID)
		if err != nil {
			return nil, err
		}
	}

	encryptedAPIKey, err := s.crypter.Encrypt(apiKey)
	if err != nil {
		return nil, fmt.Errorf("encrypt provider API key: %w", err)
	}

	preset := &models.LLMProviderPreset{
		UserID:          userID,
		Name:            normalized.Name,
		BaseURL:         normalized.BaseURL,
		EncryptedAPIKey: encryptedAPIKey,
		APIKeyHint:      apiKeyHint(apiKey),
		Models:          normalized.Models,
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

	normalized, err := sanitizeUpdatePresetInput(input, preset)
	if err != nil {
		return nil, err
	}

	updates := providerPresetUpdates{
		UpdatedAt: time.Now(),
	}
	hasUpdates := false

	if normalized.Name != nil {
		updates.Name = normalized.Name
		hasUpdates = true
	}
	if normalized.BaseURL != nil {
		updates.BaseURL = normalized.BaseURL
		hasUpdates = true
	}
	if normalized.Models != nil {
		updates.Models = *normalized.Models
		hasUpdates = true
	}
	if normalized.DefaultModel != nil {
		updates.DefaultModel = normalized.DefaultModel
		hasUpdates = true
	}
	if normalized.APIKey != nil {
		encryptedAPIKey, err := s.crypter.Encrypt(*normalized.APIKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt provider API key: %w", err)
		}
		apiKeyHint := apiKeyHint(*normalized.APIKey)
		updates.EncryptedAPIKey = &encryptedAPIKey
		updates.APIKeyHint = &apiKeyHint
		hasUpdates = true
	}

	if hasUpdates {
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

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.User{}).
			Where("id = ? AND default_provider_preset_id = ?", userID, presetID).
			Update("default_provider_preset_id", nil).Error; err != nil {
			return fmt.Errorf("clear user default provider preset: %w", err)
		}
		if err := tx.Model(&models.Conversation{}).
			Where("user_id = ? AND provider_preset_id = ?", userID, presetID).
			Update("provider_preset_id", nil).Error; err != nil {
			return fmt.Errorf("clear conversation provider preset: %w", err)
		}
		if err := tx.Delete(preset).Error; err != nil {
			return fmt.Errorf("delete provider preset: %w", err)
		}
		return nil
	}); err != nil {
		return err
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
