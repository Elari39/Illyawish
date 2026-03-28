package rag

import (
	"fmt"
	"net/url"
	"strings"

	"backend/internal/models"
)

type requestError struct {
	message string
}

func (e requestError) Error() string {
	return e.message
}

func normalizeBaseURL(value string) string {
	trimmed := strings.TrimSpace(value)
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
	return strings.TrimRight(parsed.String(), "/")
}

func sanitizeCreateProviderInput(input CreateProviderPresetInput) (CreateProviderPresetInput, error) {
	normalized := CreateProviderPresetInput{
		Name:           strings.TrimSpace(input.Name),
		BaseURL:        normalizeBaseURL(input.BaseURL),
		APIKey:         strings.TrimSpace(input.APIKey),
		EmbeddingModel: strings.TrimSpace(input.EmbeddingModel),
		RerankerModel:  strings.TrimSpace(input.RerankerModel),
	}
	if normalized.Name == "" {
		return CreateProviderPresetInput{}, requestError{message: "provider name is required"}
	}
	if normalized.BaseURL == "" {
		return CreateProviderPresetInput{}, requestError{message: "provider base URL must be a valid http or https URL"}
	}
	if normalized.APIKey == "" {
		return CreateProviderPresetInput{}, requestError{message: "provider API key is required"}
	}
	if normalized.EmbeddingModel == "" {
		return CreateProviderPresetInput{}, requestError{message: "embedding model is required"}
	}
	if normalized.RerankerModel == "" {
		return CreateProviderPresetInput{}, requestError{message: "reranker model is required"}
	}
	return normalized, nil
}

func sanitizeUpdateProviderInput(input UpdateProviderPresetInput, preset *models.RAGProviderPreset) (UpdateProviderPresetInput, error) {
	normalized := UpdateProviderPresetInput{}
	if input.Name != nil {
		value := strings.TrimSpace(*input.Name)
		if value == "" {
			return UpdateProviderPresetInput{}, requestError{message: "provider name is required"}
		}
		normalized.Name = &value
	}
	if input.BaseURL != nil {
		value := normalizeBaseURL(*input.BaseURL)
		if value == "" {
			return UpdateProviderPresetInput{}, requestError{message: "provider base URL must be a valid http or https URL"}
		}
		normalized.BaseURL = &value
	}
	if input.APIKey != nil {
		value := strings.TrimSpace(*input.APIKey)
		if value == "" {
			return UpdateProviderPresetInput{}, requestError{message: "provider API key is required"}
		}
		normalized.APIKey = &value
	}
	if input.EmbeddingModel != nil {
		value := strings.TrimSpace(*input.EmbeddingModel)
		if value == "" {
			return UpdateProviderPresetInput{}, requestError{message: "embedding model is required"}
		}
		normalized.EmbeddingModel = &value
	}
	if input.RerankerModel != nil {
		value := strings.TrimSpace(*input.RerankerModel)
		if value == "" {
			return UpdateProviderPresetInput{}, requestError{message: "reranker model is required"}
		}
		normalized.RerankerModel = &value
	}
	if preset == nil {
		return UpdateProviderPresetInput{}, fmt.Errorf("provider preset is required")
	}
	return normalized, nil
}
