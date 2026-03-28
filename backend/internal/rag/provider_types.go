package rag

import "backend/internal/models"

const (
	ProviderSourcePreset   = "preset"
	ProviderSourceFallback = "fallback"
	ProviderSourceNone     = "none"
)

type ProviderConfig struct {
	BaseURL        string
	APIKey         string
	EmbeddingModel string
	RerankerModel  string
}

type ProviderPresetDTO struct {
	ID             uint   `json:"id"`
	Name           string `json:"name"`
	BaseURL        string `json:"baseURL"`
	HasAPIKey      bool   `json:"hasApiKey"`
	APIKeyHint     string `json:"apiKeyHint"`
	EmbeddingModel string `json:"embeddingModel"`
	RerankerModel  string `json:"rerankerModel"`
	IsActive       bool   `json:"isActive"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type ProviderFallbackState struct {
	Available      bool   `json:"available"`
	Name           string `json:"name"`
	BaseURL        string `json:"baseURL"`
	EmbeddingModel string `json:"embeddingModel"`
	RerankerModel  string `json:"rerankerModel"`
}

type ProviderState struct {
	Presets        []ProviderPresetDTO   `json:"presets"`
	ActivePresetID *uint                 `json:"activePresetId"`
	CurrentSource  string                `json:"currentSource"`
	Fallback       ProviderFallbackState `json:"fallback"`
}

type ResolvedProvider struct {
	Source         string
	ActivePresetID *uint
	Name           string
	Config         ProviderConfig
}

type CreateProviderPresetInput struct {
	Name           string
	BaseURL        string
	APIKey         string
	EmbeddingModel string
	RerankerModel  string
}

type UpdateProviderPresetInput struct {
	Name           *string
	BaseURL        *string
	APIKey         *string
	EmbeddingModel *string
	RerankerModel  *string
}

func toProviderPresetDTO(preset models.RAGProviderPreset) ProviderPresetDTO {
	return ProviderPresetDTO{
		ID:             preset.ID,
		Name:           preset.Name,
		BaseURL:        preset.BaseURL,
		HasAPIKey:      preset.EncryptedAPIKey != "",
		APIKeyHint:     preset.APIKeyHint,
		EmbeddingModel: preset.EmbeddingModel,
		RerankerModel:  preset.RerankerModel,
		IsActive:       preset.IsActive,
		CreatedAt:      preset.CreatedAt.Format(timeFormat),
		UpdatedAt:      preset.UpdatedAt.Format(timeFormat),
	}
}
