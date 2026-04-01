package chat

import (
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) createAssistantReply(
	conversation *models.Conversation,
	input *SendMessageInput,
) (models.Message, error) {
	var assistantMessage models.Message
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		userMessage := models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleUser,
			Content:        input.Content,
			Attachments:    input.Attachments,
			Status:         models.MessageStatusCompleted,
		}
		if err := createMessageRecord(tx, &userMessage); err != nil {
			return fmt.Errorf("create user message: %w", err)
		}

		if err := updateConversationTitleIfDefault(tx, conversation, input.Content, input.Attachments); err != nil {
			return err
		}

		var err error
		assistantMessage, err = createAssistantPlaceholder(tx, conversation.ID)
		if err != nil {
			return err
		}

		if err := touchConversation(tx, conversation.ID); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return models.Message{}, err
	}
	return assistantMessage, nil
}

func (s *Service) prepareAssistantReplay(
	conversationID uint,
	assistantMessageID uint,
	invalidAction error,
	allowedStatuses ...string,
) (*models.Message, []models.Message, error) {
	var (
		assistantMessage models.Message
		cleanupMessages  []models.Message
	)
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		message, err := conversationMessageByID(tx, conversationID, assistantMessageID)
		if err != nil {
			return err
		}
		if message.Role != models.RoleAssistant {
			return invalidAction
		}
		if len(allowedStatuses) > 0 && !containsStatus(allowedStatuses, message.Status) {
			return invalidAction
		}

		if _, err := previousUserMessage(tx, conversationID, message.ID); err != nil {
			return invalidAction
		}

		trailingMessages, err := loadTrailingMessages(tx, conversationID, message.ID)
		if err != nil {
			return err
		}
		cleanupMessages = trailingMessages

		if err := updateMessageRecord(tx, message, "", nil, models.MessageStatusStreaming); err != nil {
			return fmt.Errorf("reset assistant message: %w", err)
		}
		if err := deleteTrailingMessages(tx, conversationID, message.ID); err != nil {
			return err
		}
		if err := touchConversation(tx, conversationID); err != nil {
			return err
		}

		assistantMessage = *message
		assistantMessage.Content = ""
		assistantMessage.ReasoningContent = ""
		assistantMessage.LegacyAttachments = nil
		assistantMessage.Attachments = nil
		assistantMessage.Status = models.MessageStatusStreaming
		return nil
	}); err != nil {
		return nil, nil, err
	}

	return &assistantMessage, cleanupMessages, nil
}

func (s *Service) editUserMessageForRegeneration(
	conversation *models.Conversation,
	messageID uint,
	input *SendMessageInput,
) (models.Message, []models.Message, error) {
	var (
		assistantMessage models.Message
		cleanupMessages  []models.Message
	)
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		message, err := conversationMessageByID(tx, conversation.ID, messageID)
		if err != nil {
			return err
		}
		if message.Role != models.RoleUser {
			return ErrInvalidUserEdit
		}

		latestUserMessage, err := latestConversationMessageByRole(tx, conversation.ID, models.RoleUser)
		if err != nil {
			return err
		}
		if latestUserMessage.ID != message.ID {
			return ErrInvalidUserEdit
		}

		trailingMessages, err := loadTrailingMessages(tx, conversation.ID, message.ID)
		if err != nil {
			return err
		}
		cleanupMessages = trailingMessages

		if err := updateMessageRecord(
			tx,
			message,
			input.Content,
			input.Attachments,
			models.MessageStatusCompleted,
		); err != nil {
			return fmt.Errorf("update user message: %w", err)
		}
		if err := deleteTrailingMessages(tx, conversation.ID, message.ID); err != nil {
			return err
		}
		if err := updateConversationTitleIfDefault(tx, conversation, input.Content, input.Attachments); err != nil {
			return err
		}

		assistantMessage, err = createAssistantPlaceholder(tx, conversation.ID)
		if err != nil {
			return err
		}
		if err := touchConversation(tx, conversation.ID); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return models.Message{}, nil, err
	}

	return assistantMessage, cleanupMessages, nil
}

func loadTrailingMessages(tx *gorm.DB, conversationID uint, fromMessageID uint) ([]models.Message, error) {
	var trailingMessages []models.Message
	if err := tx.Where("conversation_id = ? AND id >= ?", conversationID, fromMessageID).
		Order("id asc").
		Find(&trailingMessages).Error; err != nil {
		return nil, fmt.Errorf("load trailing messages: %w", err)
	}
	if err := hydrateMessageAttachments(tx, trailingMessages); err != nil {
		return nil, err
	}
	return trailingMessages, nil
}

func deleteTrailingMessages(tx *gorm.DB, conversationID uint, fromMessageID uint) error {
	if err := tx.Where("conversation_id = ? AND id > ?", conversationID, fromMessageID).
		Delete(&models.Message{}).Error; err != nil {
		return fmt.Errorf("delete trailing messages: %w", err)
	}
	return nil
}

func createAssistantPlaceholder(tx *gorm.DB, conversationID uint) (models.Message, error) {
	assistantMessage := models.Message{
		ConversationID: conversationID,
		Role:           models.RoleAssistant,
		Content:        "",
		Status:         models.MessageStatusStreaming,
	}
	if err := createMessageRecord(tx, &assistantMessage); err != nil {
		return models.Message{}, fmt.Errorf("create assistant placeholder: %w", err)
	}
	return assistantMessage, nil
}

func updateConversationTitleIfDefault(tx *gorm.DB, conversation *models.Conversation, content string, attachments []models.Attachment) error {
	if strings.TrimSpace(conversation.Title) != "" && conversation.Title != defaultConversationTitle {
		return nil
	}

	title := deriveConversationTitle(content, attachments)
	if err := tx.Model(conversation).Updates(map[string]any{
		"title":      title,
		"updated_at": time.Now(),
	}).Error; err != nil {
		return fmt.Errorf("update conversation title: %w", err)
	}
	conversation.Title = title
	return nil
}

func touchConversation(tx *gorm.DB, conversationID uint) error {
	if err := tx.Model(&models.Conversation{}).
		Where("id = ?", conversationID).
		Update("updated_at", time.Now()).Error; err != nil {
		return fmt.Errorf("touch conversation: %w", err)
	}
	return nil
}

func (s *Service) finalizeAssistantMessage(
	assistantMessage *models.Message,
	content string,
	reasoning string,
	status string,
	runSummary *models.AgentRunSummary,
) error {
	assistantMessage.Content = content
	assistantMessage.ReasoningContent = reasoning
	assistantMessage.Status = status
	assistantMessage.RunSummary = models.AgentRunSummary{}
	if runSummary != nil {
		assistantMessage.RunSummary = *runSummary
	}

	if err := s.db.Model(assistantMessage).
		Select("content", "reasoning_content", "status", "run_summary").
		Updates(assistantMessage).Error; err != nil {
		return fmt.Errorf("finalize assistant message: %w", err)
	}
	return nil
}
