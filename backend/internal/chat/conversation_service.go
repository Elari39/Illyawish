package chat

import (
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
		query = query.Where("title LIKE ? ESCAPE '\\'", like)
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

func (s *Service) CreateConversation(userID uint) (*models.Conversation, error) {
	temperature := defaultTemperature
	conversation := &models.Conversation{
		UserID:       userID,
		Title:        defaultConversationTitle,
		SystemPrompt: defaultSystemPrompt,
		Temperature:  &temperature,
	}
	if err := s.db.Create(conversation).Error; err != nil {
		return nil, fmt.Errorf("create conversation: %w", err)
	}
	return conversation, nil
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
	if input.Settings != nil {
		settings, err := s.resolveSettings(conversation, input.Settings, "")
		if err != nil {
			return nil, err
		}
		updates["system_prompt"] = settings.SystemPrompt
		updates["model"] = settings.Model
		updates["temperature"] = settings.Temperature
		updates["max_tokens"] = settings.MaxTokens
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
	if _, err := s.GetConversation(userID, conversationID); err != nil {
		return nil, err
	}

	var messages []models.Message
	if err := s.db.Where("conversation_id = ?", conversationID).Order("id asc").Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	return messages, nil
}

func (s *Service) CancelGeneration(userID uint, conversationID uint) error {
	if _, err := s.GetConversation(userID, conversationID); err != nil {
		return err
	}

	s.activeMu.Lock()
	cancel, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()

	if !exists {
		return ErrNoActiveGeneration
	}

	cancel()
	return nil
}
