package chat

import (
	"fmt"
	"strings"

	"backend/internal/models"
)

func (s *Service) GetChatSettings(userID uint) (ChatSettings, error) {
	var user models.User
	if err := s.db.
		Select(
			"global_prompt",
			"default_provider_preset_id",
			"default_model",
			"default_temperature",
			"default_max_tokens",
			"default_context_window_turns",
		).
		First(&user, userID).Error; err != nil {
		return ChatSettings{}, fmt.Errorf("get chat settings: %w", err)
	}

	return applyChatSettingsDefaults(ChatSettings{
		GlobalPrompt:       strings.TrimSpace(user.GlobalPrompt),
		ProviderPresetID:   cloneUint(user.DefaultProviderPresetID),
		Model:              strings.TrimSpace(user.DefaultModel),
		Temperature:        cloneFloat32(user.DefaultTemperature),
		MaxTokens:          cloneInt(user.DefaultMaxTokens),
		ContextWindowTurns: cloneInt(user.DefaultContextWindowTurns),
	}), nil
}

func (s *Service) UpdateChatSettings(userID uint, input ChatSettings) (ChatSettings, error) {
	settings, err := sanitizeChatSettings(input)
	if err != nil {
		return ChatSettings{}, err
	}
	if err := s.validateProviderPresetOwnership(userID, settings.ProviderPresetID); err != nil {
		return ChatSettings{}, err
	}

	if err := s.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]any{
			"global_prompt":                settings.GlobalPrompt,
			"default_provider_preset_id":   settings.ProviderPresetID,
			"default_model":                settings.Model,
			"default_temperature":          settings.Temperature,
			"default_max_tokens":           settings.MaxTokens,
			"default_context_window_turns": settings.ContextWindowTurns,
		}).Error; err != nil {
		return ChatSettings{}, fmt.Errorf("update chat settings: %w", err)
	}

	return applyChatSettingsDefaults(settings), nil
}

func (s *Service) resolveSettings(
	userID uint,
	conversation *models.Conversation,
	override *ConversationSettings,
	defaultModel string,
) (ConversationSettings, error) {
	settings, err := s.effectiveConversationSettings(userID, conversation)
	if err != nil {
		return ConversationSettings{}, err
	}

	if override != nil {
		normalizedOverride, err := sanitizeConversationSettings(override)
		if err != nil {
			return ConversationSettings{}, err
		}
		settings.SystemPrompt = normalizedOverride.SystemPrompt
		if normalizedOverride.Model != "" {
			settings.Model = normalizedOverride.Model
		}
		if normalizedOverride.ProviderPresetID != nil {
			settings.ProviderPresetID = cloneUint(normalizedOverride.ProviderPresetID)
		}
		if normalizedOverride.Temperature != nil {
			settings.Temperature = cloneFloat32(normalizedOverride.Temperature)
		}
		if normalizedOverride.MaxTokens != nil {
			settings.MaxTokens = cloneInt(normalizedOverride.MaxTokens)
		}
		if normalizedOverride.ContextWindowTurns != nil {
			settings.ContextWindowTurns = cloneInt(normalizedOverride.ContextWindowTurns)
		}
	}

	if settings.Model == "" {
		settings.Model = strings.TrimSpace(defaultModel)
	}
	if settings.Temperature == nil {
		settings.Temperature = ptrFloat32(defaultTemperature)
	}

	return settings, nil
}

func (s *Service) resolveSystemPrompt(userID uint, sessionPrompt string) (string, error) {
	sessionPrompt = strings.TrimSpace(sessionPrompt)
	if sessionPrompt != "" {
		return sessionPrompt, nil
	}

	settings, err := s.GetChatSettings(userID)
	if err != nil {
		return "", err
	}

	return settings.GlobalPrompt, nil
}

func (s *Service) applyConversationDefaults(conversation *models.Conversation) {
	if conversation == nil {
		return
	}
	if strings.TrimSpace(conversation.Title) == "" {
		conversation.Title = defaultConversationTitle
	}
	if conversation.Tags == nil {
		conversation.Tags = []string{}
	}
}

func (s *Service) effectiveConversationSettings(
	userID uint,
	conversation *models.Conversation,
) (ConversationSettings, error) {
	chatSettings, err := s.GetChatSettings(userID)
	if err != nil {
		return ConversationSettings{}, err
	}

	return ConversationSettings{
		SystemPrompt:       strings.TrimSpace(conversation.SystemPrompt),
		ProviderPresetID:   firstNonNilUint(conversation.ProviderPresetID, chatSettings.ProviderPresetID),
		Model:              firstNonEmptyString(strings.TrimSpace(conversation.Model), strings.TrimSpace(chatSettings.Model)),
		Temperature:        firstNonNilFloat32(conversation.Temperature, chatSettings.Temperature),
		MaxTokens:          firstNonNilInt(conversation.MaxTokens, chatSettings.MaxTokens),
		ContextWindowTurns: firstNonNilInt(conversation.ContextWindowTurns, chatSettings.ContextWindowTurns),
	}, nil
}
