package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) ListConversations(
	userID uint,
	params ListConversationsParams,
) (*ConversationListResult, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	query := s.db.Model(&models.Conversation{}).
		Where("user_id = ? AND is_archived = ?", userID, params.Archived)

	search := strings.TrimSpace(params.Search)
	if search != "" {
		like := "%" + escapeLike(search) + "%"
		query = query.Where(`
			conversations.title LIKE ? ESCAPE '\' OR
			conversations.folder LIKE ? ESCAPE '\' OR
			COALESCE(conversations.tags, '') LIKE ? ESCAPE '\' OR
			EXISTS (
				SELECT 1
				FROM messages
				WHERE messages.conversation_id = conversations.id
				  AND messages.content LIKE ? ESCAPE '\'
			) OR
			EXISTS (
				SELECT 1
				FROM messages
				LEFT JOIN message_attachments ON message_attachments.message_id = messages.id
				LEFT JOIN stored_attachments ON stored_attachments.id = message_attachments.attachment_id
				WHERE messages.conversation_id = conversations.id
				  AND (
					stored_attachments.name LIKE ? ESCAPE '\' OR
					COALESCE(stored_attachments.extracted_text, '') LIKE ? ESCAPE '\'
				  )
			)
		`, like, like, like, like, like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("count conversations: %w", err)
	}

	var conversations []models.Conversation
	if err := query.
		Order("is_pinned desc").
		Order("updated_at desc").
		Offset(maxInt(params.Offset, 0)).
		Limit(limit).
		Find(&conversations).Error; err != nil {
		return nil, fmt.Errorf("list conversations: %w", err)
	}

	for index := range conversations {
		s.applyConversationDefaults(&conversations[index])
	}

	return &ConversationListResult{
		Conversations: conversations,
		Total:         total,
	}, nil
}

func (s *Service) CreateConversation(userID uint, input CreateConversationInput) (*models.Conversation, error) {
	if err := s.enforceConversationQuota(userID); err != nil {
		return nil, err
	}

	var settings ConversationSettings
	if input.Settings != nil {
		var err error
		settings, err = sanitizeConversationSettings(input.Settings)
		if err != nil {
			return nil, err
		}
		if err := s.validateProviderPresetOwnership(userID, settings.ProviderPresetID); err != nil {
			return nil, err
		}
	}

	folder := ""
	if input.Folder != nil {
		normalizedFolder, err := sanitizeConversationFolder(*input.Folder)
		if err != nil {
			return nil, err
		}
		folder = normalizedFolder
	}

	tags := []string{}
	if input.Tags != nil {
		normalizedTags, err := sanitizeConversationTags(*input.Tags)
		if err != nil {
			return nil, err
		}
		tags = normalizedTags
	}

	conversation := &models.Conversation{
		UserID:             userID,
		Title:              defaultConversationTitle,
		WorkflowPresetID:   input.WorkflowPresetID,
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
		var settings ConversationSettings
		if input.Settings != nil {
			var err error
			settings, err = sanitizeConversationSettings(input.Settings)
			if err != nil {
				return err
			}
			if err := s.validateProviderPresetOwnership(userID, settings.ProviderPresetID); err != nil {
				return err
			}
		}

		conversation = &models.Conversation{
			UserID:             userID,
			Title:              title,
			WorkflowPresetID:   input.WorkflowPresetID,
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

		messages := make([]models.Message, 0, len(input.Messages))
		for _, message := range input.Messages {
			role := strings.TrimSpace(message.Role)
			if role != models.RoleUser && role != models.RoleAssistant {
				return requestError{message: "message role must be user or assistant"}
			}

			content := strings.TrimSpace(message.Content)
			if content == "" {
				return requestError{message: "message content is required"}
			}

			messages = append(messages, models.Message{
				ConversationID: conversation.ID,
				Role:           role,
				Content:        content,
				Status:         models.MessageStatusCompleted,
			})
		}

		if err := tx.Create(&messages).Error; err != nil {
			return fmt.Errorf("create imported messages: %w", err)
		}

		if err := tx.Model(conversation).
			Update("updated_at", importedAt).Error; err != nil {
			return fmt.Errorf("touch imported conversation: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.GetConversation(userID, conversation.ID)
}

func (s *Service) GetConversation(userID uint, conversationID uint) (*models.Conversation, error) {
	var conversation models.Conversation
	if err := s.db.Where("id = ? AND user_id = ?", conversationID, userID).First(&conversation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("get conversation: %w", err)
	}
	s.applyConversationDefaults(&conversation)
	return &conversation, nil
}

func (s *Service) GetConversationByPublicID(userID uint, publicID string) (*models.Conversation, error) {
	var conversation models.Conversation
	if err := s.db.Where("public_id = ? AND user_id = ?", publicID, userID).First(&conversation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("get conversation by public id: %w", err)
	}
	s.applyConversationDefaults(&conversation)
	return &conversation, nil
}

func valueOrEmptyUintSlice(values *[]uint) []uint {
	if values == nil {
		return nil
	}
	return *values
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
	if input.Settings != nil {
		settings, err := sanitizeConversationSettings(input.Settings)
		if err != nil {
			return nil, err
		}
		if err := s.validateProviderPresetOwnership(userID, settings.ProviderPresetID); err != nil {
			return nil, err
		}
		updates["system_prompt"] = settings.SystemPrompt
		updates["provider_preset_id"] = settings.ProviderPresetID
		updates["model"] = settings.Model
		updates["temperature"] = settings.Temperature
		updates["max_tokens"] = settings.MaxTokens
		updates["context_window_turns"] = settings.ContextWindowTurns
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

func (s *Service) cleanupAttachments(messages []models.Message) error {
	if s.uploads == nil {
		return nil
	}
	return s.uploads.CleanupUnreferenced(collectMessageAttachments(messages))
}

func (s *Service) ListMessages(userID uint, conversationID uint) ([]models.Message, error) {
	result, err := s.ListMessagesPage(userID, conversationID, ListMessagesParams{})
	if err != nil {
		return nil, err
	}
	return result.Messages, nil
}

func (s *Service) CancelGeneration(userID uint, conversationID uint) error {
	if _, err := s.GetConversation(userID, conversationID); err != nil {
		return err
	}

	s.activeMu.Lock()
	cancel, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()

	if !exists {
		return nil
	}

	cancel()
	return nil
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
