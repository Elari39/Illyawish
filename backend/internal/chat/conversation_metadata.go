package chat

import (
	"encoding/json"
	"fmt"
	"strings"

	"backend/internal/models"
)

func valueOrEmptyUintSlice(values *[]uint) []uint {
	if values == nil {
		return nil
	}
	return *values
}

func serializeKnowledgeSpaceIDs(values []uint) (string, error) {
	payload, err := json.Marshal(cloneUintSlice(values))
	if err != nil {
		return "", fmt.Errorf("serialize knowledge space ids: %w", err)
	}
	return string(payload), nil
}

func sanitizeConversationFolder(value string) (string, error) {
	folder := strings.TrimSpace(value)
	if len([]rune(folder)) > 120 {
		return "", requestError{message: "conversation folder must be 120 characters or fewer"}
	}
	return folder, nil
}

func sanitizeConversationTags(tags []string) ([]string, error) {
	if len(tags) == 0 {
		return nil, nil
	}

	normalized := make([]string, 0, len(tags))
	seen := map[string]struct{}{}
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		if len([]rune(trimmed)) > 32 {
			return nil, requestError{message: "conversation tags must be 32 characters or fewer"}
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	if len(normalized) > 12 {
		return nil, requestError{message: "a maximum of 12 tags can be saved"}
	}
	if len(normalized) == 0 {
		return nil, nil
	}
	return normalized, nil
}

func serializeConversationTags(tags []string) (string, error) {
	if len(tags) == 0 {
		return "[]", nil
	}

	encoded, err := json.Marshal(tags)
	if err != nil {
		return "", fmt.Errorf("serialize conversation tags: %w", err)
	}
	return string(encoded), nil
}

func buildConversationRecord(userID uint, input CreateConversationInput, settings ConversationSettings, folder string, tags []string) *models.Conversation {
	return &models.Conversation{
		UserID:             userID,
		Title:              defaultConversationTitle,
		KnowledgeSpaceIDs:  cloneUintSlice(valueOrEmptyUintSlice(input.KnowledgeSpaceIDs)),
		SystemPrompt:       settings.SystemPrompt,
		ProviderPresetID:   cloneUint(settings.ProviderPresetID),
		Model:              settings.Model,
		Temperature:        cloneFloat32(settings.Temperature),
		MaxTokens:          cloneInt(settings.MaxTokens),
		ContextWindowTurns: cloneInt(settings.ContextWindowTurns),
		Folder:             folder,
		Tags:               tags,
	}
}
