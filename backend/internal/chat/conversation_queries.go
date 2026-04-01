package chat

import (
	"errors"
	"fmt"
	"strings"

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
	run, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()

	if !exists {
		return nil
	}

	run.setCancelReason(runCancelReasonUser)
	run.cancel()
	return nil
}
