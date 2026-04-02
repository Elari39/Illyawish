package chat

import "strings"

func sanitizeConversationSettings(settings *ConversationSettings) (ConversationSettings, error) {
	if settings == nil {
		return ConversationSettings{}, nil
	}
	normalized := ConversationSettings{
		SystemPrompt:     strings.TrimSpace(settings.SystemPrompt),
		ProviderPresetID: cloneUint(settings.ProviderPresetID),
		Model:            strings.TrimSpace(settings.Model),
	}

	if settings.Temperature != nil {
		if *settings.Temperature < 0 || *settings.Temperature > 2 {
			return ConversationSettings{}, requestError{message: "temperature must be between 0 and 2"}
		}
		normalized.Temperature = ptrFloat32(*settings.Temperature)
	}

	if settings.MaxTokens != nil {
		if *settings.MaxTokens < 0 {
			return ConversationSettings{}, requestError{message: "max tokens must be greater than or equal to 0"}
		}
		normalized.MaxTokens = ptrInt(*settings.MaxTokens)
	}

	if settings.ContextWindowTurns != nil {
		if *settings.ContextWindowTurns < 0 {
			return ConversationSettings{}, requestError{message: "context window turns must be greater than or equal to 0"}
		}
		normalized.ContextWindowTurns = ptrInt(*settings.ContextWindowTurns)
	}

	return normalized, nil
}

func sanitizeChatSettings(settings ChatSettings) (ChatSettings, error) {
	normalized := ChatSettings{
		GlobalPrompt:     strings.TrimSpace(settings.GlobalPrompt),
		ProviderPresetID: cloneUint(settings.ProviderPresetID),
		Model:            strings.TrimSpace(settings.Model),
	}

	if settings.Temperature != nil {
		if *settings.Temperature < 0 || *settings.Temperature > 2 {
			return ChatSettings{}, requestError{message: "temperature must be between 0 and 2"}
		}
		normalized.Temperature = ptrFloat32(*settings.Temperature)
	}

	if settings.MaxTokens != nil {
		if *settings.MaxTokens < 0 {
			return ChatSettings{}, requestError{message: "max tokens must be greater than or equal to 0"}
		}
		normalized.MaxTokens = ptrInt(*settings.MaxTokens)
	}

	if settings.ContextWindowTurns != nil {
		if *settings.ContextWindowTurns < 0 {
			return ChatSettings{}, requestError{message: "context window turns must be greater than or equal to 0"}
		}
		normalized.ContextWindowTurns = ptrInt(*settings.ContextWindowTurns)
	}

	return normalized, nil
}

func applyChatSettingsDefaults(settings ChatSettings) ChatSettings {
	if settings.Temperature == nil {
		settings.Temperature = ptrFloat32(defaultTemperature)
	}
	return settings
}

func cloneFloat32(value *float32) *float32 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneUint(value *uint) *uint {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func ptrFloat32(value float32) *float32 {
	return &value
}

func ptrInt(value int) *int {
	return &value
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func firstNonNilFloat32(values ...*float32) *float32 {
	for _, value := range values {
		if value != nil {
			return cloneFloat32(value)
		}
	}
	return nil
}

func firstNonNilInt(values ...*int) *int {
	for _, value := range values {
		if value != nil {
			return cloneInt(value)
		}
	}
	return nil
}

func firstNonNilUint(values ...*uint) *uint {
	for _, value := range values {
		if value != nil {
			return cloneUint(value)
		}
	}
	return nil
}
