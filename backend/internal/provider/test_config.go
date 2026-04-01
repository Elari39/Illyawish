package provider

import (
	"fmt"
	"strings"

	"backend/internal/llm"
)

func (s *Service) resolveTestConfig(userID uint, input TestPresetInput) (llm.ProviderConfig, error) {
	baseURL := strings.TrimSpace(input.BaseURL)
	apiKey := strings.TrimSpace(input.APIKey)
	defaultModel := strings.TrimSpace(input.DefaultModel)
	format := normalizeProviderFormat(input.Format)
	if format == "" {
		format = llm.ProviderFormatOpenAI
	}

	if input.PresetID != nil {
		preset, err := s.getPreset(userID, *input.PresetID)
		if err != nil {
			return llm.ProviderConfig{}, err
		}

		if baseURL == "" {
			baseURL = preset.BaseURL
		}
		format = normalizeProviderFormat(preset.Format)
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

	if apiKey == "" && input.ReuseActiveAPIKey {
		var err error
		apiKey, err = s.resolveActivePresetAPIKey(userID)
		if err != nil {
			return llm.ProviderConfig{}, err
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
		Format:       format,
		BaseURL:      normalized,
		APIKey:       apiKey,
		DefaultModel: defaultModel,
	}, nil
}
