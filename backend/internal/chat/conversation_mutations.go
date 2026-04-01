package chat

import (
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) CreateConversation(userID uint, input CreateConversationInput) (*models.Conversation, error) {
	settings, folder, tags, err := s.prepareConversationCreateInput(userID, input)
	if err != nil {
		return nil, err
	}

	conversation := buildConversationRecord(userID, input, settings, folder, tags)
	if err := s.db.Create(conversation).Error; err != nil {
		return nil, fmt.Errorf("create conversation: %w", err)
	}
	return s.GetConversation(userID, conversation.ID)
}

func (s *Service) ImportConversation(
	userID uint,
	input ImportConversationInput,
) (*models.Conversation, error) {
	if err := s.enforceConversationQuota(userID); err != nil {
		return nil, err
	}
	if err := s.validateKnowledgeSpaceOwnership(userID, valueOrEmptyUintSlice(input.KnowledgeSpaceIDs)); err != nil {
		return nil, err
	}

	title := strings.TrimSpace(input.Title)
	if title == "" {
		return nil, requestError{message: "conversation title is required"}
	}
	if len(input.Messages) == 0 {
		return nil, requestError{message: "at least one message is required"}
	}

	importedAt := time.Now()
	conversation := &models.Conversation{}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		settings, err := s.sanitizeConversationSettingsForUser(userID, input.Settings)
		if err != nil {
			return err
		}

		conversation = &models.Conversation{
			UserID:             userID,
			Title:              title,
			KnowledgeSpaceIDs:  cloneUintSlice(valueOrEmptyUintSlice(input.KnowledgeSpaceIDs)),
			SystemPrompt:       settings.SystemPrompt,
			ProviderPresetID:   cloneUint(settings.ProviderPresetID),
			Model:              settings.Model,
			Temperature:        cloneFloat32(settings.Temperature),
			MaxTokens:          cloneInt(settings.MaxTokens),
			ContextWindowTurns: cloneInt(settings.ContextWindowTurns),
			UpdatedAt:          importedAt,
		}
		if err := tx.Create(conversation).Error; err != nil {
			return fmt.Errorf("create imported conversation: %w", err)
		}

		messages, err := buildImportedMessages(conversation.ID, input.Messages)
		if err != nil {
			return err
		}
		if err := tx.Create(&messages).Error; err != nil {
			return fmt.Errorf("create imported messages: %w", err)
		}
		if err := tx.Model(conversation).Update("updated_at", importedAt).Error; err != nil {
			return fmt.Errorf("touch imported conversation: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.GetConversation(userID, conversation.ID)
}

func (s *Service) UpdateConversation(
	userID uint,
	conversationID uint,
	input ConversationUpdateInput,
) (*models.Conversation, error) {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return nil, err
	}

	updates, err := s.buildConversationUpdates(userID, conversation, input)
	if err != nil {
		return nil, err
	}
	if err := s.db.Model(conversation).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update conversation: %w", err)
	}

	return s.GetConversation(userID, conversationID)
}

func (s *Service) DeleteConversation(userID uint, conversationID uint) error {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	messages, err := s.ListMessages(userID, conversationID)
	if err != nil {
		return err
	}

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("conversation_id = ?", conversation.ID).Delete(&models.Message{}).Error; err != nil {
			return fmt.Errorf("delete conversation messages: %w", err)
		}
		if err := tx.Delete(&models.Conversation{}, conversation.ID).Error; err != nil {
			return fmt.Errorf("delete conversation: %w", err)
		}
		return nil
	}); err != nil {
		return err
	}

	return s.cleanupAttachments(messages)
}

func (s *Service) prepareConversationCreateInput(userID uint, input CreateConversationInput) (ConversationSettings, string, []string, error) {
	if err := s.enforceConversationQuota(userID); err != nil {
		return ConversationSettings{}, "", nil, err
	}
	if err := s.validateKnowledgeSpaceOwnership(userID, valueOrEmptyUintSlice(input.KnowledgeSpaceIDs)); err != nil {
		return ConversationSettings{}, "", nil, err
	}

	settings, err := s.sanitizeConversationSettingsForUser(userID, input.Settings)
	if err != nil {
		return ConversationSettings{}, "", nil, err
	}
	folder, err := sanitizeOptionalConversationFolder(input.Folder)
	if err != nil {
		return ConversationSettings{}, "", nil, err
	}
	tags, err := sanitizeOptionalConversationTags(input.Tags)
	if err != nil {
		return ConversationSettings{}, "", nil, err
	}
	return settings, folder, tags, nil
}

func (s *Service) sanitizeConversationSettingsForUser(userID uint, input *ConversationSettings) (ConversationSettings, error) {
	if input == nil {
		return ConversationSettings{}, nil
	}

	settings, err := sanitizeConversationSettings(input)
	if err != nil {
		return ConversationSettings{}, err
	}
	if err := s.validateProviderPresetOwnership(userID, settings.ProviderPresetID); err != nil {
		return ConversationSettings{}, err
	}
	return settings, nil
}

func sanitizeOptionalConversationFolder(value *string) (string, error) {
	if value == nil {
		return "", nil
	}
	return sanitizeConversationFolder(*value)
}

func sanitizeOptionalConversationTags(tags *[]string) ([]string, error) {
	if tags == nil {
		return []string{}, nil
	}
	return sanitizeConversationTags(*tags)
}

func buildImportedMessages(conversationID uint, inputs []ImportMessageInput) ([]models.Message, error) {
	messages := make([]models.Message, 0, len(inputs))
	for _, message := range inputs {
		role := strings.TrimSpace(message.Role)
		if role != models.RoleUser && role != models.RoleAssistant {
			return nil, requestError{message: "message role must be user or assistant"}
		}

		content := strings.TrimSpace(message.Content)
		if content == "" {
			return nil, requestError{message: "message content is required"}
		}

		messages = append(messages, models.Message{
			ConversationID: conversationID,
			Role:           role,
			Content:        content,
			Status:         models.MessageStatusCompleted,
		})
	}
	return messages, nil
}

func (s *Service) buildConversationUpdates(userID uint, conversation *models.Conversation, input ConversationUpdateInput) (map[string]any, error) {
	updates := map[string]any{
		"updated_at": time.Now(),
	}

	if input.Title != nil {
		title := strings.TrimSpace(*input.Title)
		if title == "" {
			return nil, requestError{message: "conversation title is required"}
		}
		updates["title"] = title
	}
	if input.IsPinned != nil {
		updates["is_pinned"] = *input.IsPinned
	}
	if input.IsArchived != nil {
		updates["is_archived"] = *input.IsArchived
	}
	if input.Folder != nil {
		folder, err := sanitizeConversationFolder(*input.Folder)
		if err != nil {
			return nil, err
		}
		updates["folder"] = folder
	}
	if input.Tags != nil {
		normalizedTags, err := sanitizeConversationTags(*input.Tags)
		if err != nil {
			return nil, err
		}
		serializedTags, err := serializeConversationTags(normalizedTags)
		if err != nil {
			return nil, err
		}
		updates["tags"] = serializedTags
	}
	if input.KnowledgeSpaceIDs != nil {
		knowledgeSpaceIDs := cloneUintSlice(*input.KnowledgeSpaceIDs)
		if err := s.validateKnowledgeSpaceOwnership(userID, knowledgeSpaceIDs); err != nil {
			return nil, err
		}
		serializedKnowledgeSpaceIDs, err := serializeKnowledgeSpaceIDs(knowledgeSpaceIDs)
		if err != nil {
			return nil, err
		}
		updates["knowledge_space_ids"] = serializedKnowledgeSpaceIDs
	}
	if input.Settings != nil {
		settings, err := s.sanitizeConversationSettingsForUser(userID, input.Settings)
		if err != nil {
			return nil, err
		}
		updates["system_prompt"] = settings.SystemPrompt
		updates["provider_preset_id"] = settings.ProviderPresetID
		updates["model"] = settings.Model
		updates["temperature"] = settings.Temperature
		updates["max_tokens"] = settings.MaxTokens
		updates["context_window_turns"] = settings.ContextWindowTurns
	}

	if conversation != nil && conversation.ID == 0 {
		return nil, fmt.Errorf("build conversation updates: conversation id is required")
	}

	return updates, nil
}

func (s *Service) cleanupAttachments(messages []models.Message) error {
	if s.uploads == nil {
		return nil
	}
	return s.uploads.CleanupUnreferenced(collectMessageAttachments(messages))
}
