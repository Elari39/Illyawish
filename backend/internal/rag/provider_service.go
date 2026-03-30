package rag

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/config"
	"backend/internal/models"

	"gorm.io/gorm"
)

const timeFormat = "2006-01-02T15:04:05Z07:00"

type ProviderService struct {
	db       *gorm.DB
	fallback ResolvedProvider
	crypter  *apiKeyCrypter
}

func NewProviderService(db *gorm.DB, cfg *config.Config) (*ProviderService, error) {
	encryptionSecret := strings.TrimSpace(cfg.SettingsEncryptionKey)
	if encryptionSecret == "" {
		encryptionSecret = strings.TrimSpace(cfg.SessionSecret)
	}
	crypter, err := newAPIKeyCrypter(encryptionSecret)
	if err != nil {
		return nil, err
	}

	activeID := uint(0)
	return &ProviderService{
		db: db,
		fallback: ResolvedProvider{
			Source: ProviderSourceFallback,
			ActivePresetID: func() *uint {
				if strings.TrimSpace(cfg.RAGBaseURL) == "" || strings.TrimSpace(cfg.RAGAPIKey) == "" {
					return nil
				}
				return &activeID
			}(),
			Name: "SiliconFlow",
			Config: ProviderConfig{
				BaseURL:        normalizeBaseURL(cfg.RAGBaseURL),
				APIKey:         strings.TrimSpace(cfg.RAGAPIKey),
				EmbeddingModel: strings.TrimSpace(cfg.RAGEmbeddingModel),
				RerankerModel:  strings.TrimSpace(cfg.RAGRerankerModel),
			},
		},
		crypter: crypter,
	}, nil
}

func isCompleteFallbackProviderConfig(provider ProviderConfig) bool {
	return strings.TrimSpace(provider.BaseURL) != "" &&
		strings.TrimSpace(provider.APIKey) != "" &&
		strings.TrimSpace(provider.EmbeddingModel) != "" &&
		strings.TrimSpace(provider.RerankerModel) != ""
}

func (s *ProviderService) CreateProviderPreset(userID uint, input CreateProviderPresetInput) (*models.RAGProviderPreset, error) {
	normalized, err := sanitizeCreateProviderInput(input)
	if err != nil {
		return nil, err
	}
	encrypted, err := s.crypter.Encrypt(normalized.APIKey)
	if err != nil {
		return nil, fmt.Errorf("encrypt provider API key: %w", err)
	}

	preset := &models.RAGProviderPreset{
		UserID:          userID,
		Name:            normalized.Name,
		BaseURL:         normalized.BaseURL,
		EncryptedAPIKey: encrypted,
		APIKeyHint:      apiKeyHint(normalized.APIKey),
		EmbeddingModel:  normalized.EmbeddingModel,
		RerankerModel:   normalized.RerankerModel,
		IsActive:        true,
	}

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.RAGProviderPreset{}).
			Where("user_id = ?", userID).
			Update("is_active", false).Error; err != nil {
			return fmt.Errorf("deactivate rag provider presets: %w", err)
		}
		if err := tx.Create(preset).Error; err != nil {
			return fmt.Errorf("create rag provider preset: %w", err)
		}
		return nil
	}); err != nil {
		return nil, err
	}

	return preset, nil
}

func (s *ProviderService) ActivateProviderPreset(userID uint, presetID uint) (*models.RAGProviderPreset, error) {
	if _, err := s.getPreset(userID, presetID); err != nil {
		return nil, err
	}
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.RAGProviderPreset{}).
			Where("user_id = ?", userID).
			Update("is_active", false).Error; err != nil {
			return err
		}
		result := tx.Model(&models.RAGProviderPreset{}).
			Where("id = ? AND user_id = ?", presetID, userID).
			Update("is_active", true)
		if result.Error != nil {
			return result.Error
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

func (s *ProviderService) UpdateProviderPreset(userID uint, presetID uint, input UpdateProviderPresetInput) (*models.RAGProviderPreset, error) {
	preset, err := s.getPreset(userID, presetID)
	if err != nil {
		return nil, err
	}
	normalized, err := sanitizeUpdateProviderInput(input, preset)
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
	if normalized.EmbeddingModel != nil {
		updates["embedding_model"] = *normalized.EmbeddingModel
	}
	if normalized.RerankerModel != nil {
		updates["reranker_model"] = *normalized.RerankerModel
	}
	if normalized.APIKey != nil {
		encrypted, err := s.crypter.Encrypt(*normalized.APIKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt provider API key: %w", err)
		}
		updates["encrypted_api_key"] = encrypted
		updates["api_key_hint"] = apiKeyHint(*normalized.APIKey)
	}
	if err := s.db.Model(preset).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update rag provider preset: %w", err)
	}
	return s.getPreset(userID, presetID)
}

func (s *ProviderService) DeleteProviderPreset(userID uint, presetID uint) error {
	preset, err := s.getPreset(userID, presetID)
	if err != nil {
		return err
	}
	return s.db.Delete(preset).Error
}

func (s *ProviderService) ResolveProviderForUser(userID uint) (*ResolvedProvider, error) {
	var preset models.RAGProviderPreset
	if err := s.db.Where("user_id = ? AND is_active = ?", userID, true).First(&preset).Error; err == nil {
		apiKey, err := s.crypter.Decrypt(preset.EncryptedAPIKey)
		if err != nil {
			return nil, fmt.Errorf("decrypt rag provider API key: %w", err)
		}
		presetID := preset.ID
		return &ResolvedProvider{
			Source:         ProviderSourcePreset,
			ActivePresetID: &presetID,
			Name:           preset.Name,
			Config: ProviderConfig{
				BaseURL:        preset.BaseURL,
				APIKey:         apiKey,
				EmbeddingModel: preset.EmbeddingModel,
				RerankerModel:  preset.RerankerModel,
			},
		}, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("load active rag provider preset: %w", err)
	}

	if isCompleteFallbackProviderConfig(s.fallback.Config) {
		fallback := s.fallback
		return &fallback, nil
	}
	return nil, gorm.ErrRecordNotFound
}

func (s *ProviderService) ListProviderState(userID uint) (*ProviderState, error) {
	var presets []models.RAGProviderPreset
	if err := s.db.Where("user_id = ?", userID).
		Order("is_active desc").
		Order("updated_at desc").
		Find(&presets).Error; err != nil {
		return nil, fmt.Errorf("list rag provider presets: %w", err)
	}

	state := &ProviderState{
		Presets:       make([]ProviderPresetDTO, 0, len(presets)),
		CurrentSource: ProviderSourceNone,
		Fallback: ProviderFallbackState{
			Available:      isCompleteFallbackProviderConfig(s.fallback.Config),
			Name:           s.fallback.Name,
			BaseURL:        s.fallback.Config.BaseURL,
			EmbeddingModel: s.fallback.Config.EmbeddingModel,
			RerankerModel:  s.fallback.Config.RerankerModel,
		},
	}

	for _, preset := range presets {
		dto := toProviderPresetDTO(preset)
		state.Presets = append(state.Presets, dto)
		if preset.IsActive {
			presetID := preset.ID
			state.ActivePresetID = &presetID
			state.CurrentSource = ProviderSourcePreset
		}
	}
	if state.CurrentSource == ProviderSourceNone && state.Fallback.Available {
		state.CurrentSource = ProviderSourceFallback
	}
	return state, nil
}

func (s *ProviderService) getPreset(userID uint, presetID uint) (*models.RAGProviderPreset, error) {
	var preset models.RAGProviderPreset
	if err := s.db.Where("id = ? AND user_id = ?", presetID, userID).First(&preset).Error; err != nil {
		return nil, err
	}
	return &preset, nil
}
