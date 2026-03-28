package provider

import (
	"strings"

	"backend/internal/models"
)

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
