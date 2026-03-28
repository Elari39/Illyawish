package provider

import (
	"strings"

	"backend/internal/llm"
	"backend/internal/models"
)

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
	if apiKey == "" && !input.ReuseActiveAPIKey {
		return CreatePresetInput{}, requestError{message: "provider API key is required"}
	}

	models, defaultModel, err := normalizeProviderModels(input.Models, input.DefaultModel)
	if err != nil {
		return CreatePresetInput{}, err
	}

	return CreatePresetInput{
		Name:              name,
		BaseURL:           baseURL,
		APIKey:            apiKey,
		ReuseActiveAPIKey: input.ReuseActiveAPIKey,
		Models:            models,
		DefaultModel:      defaultModel,
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
		if apiKey != "" {
			normalized.APIKey = &apiKey
		}
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

		models, defaultModel, err := normalizeProviderModels(nextModels, nextDefaultModel)
		if err != nil {
			return UpdatePresetInput{}, err
		}

		normalized.Models = &models
		normalized.DefaultModel = &defaultModel
	}

	return normalized, nil
}
