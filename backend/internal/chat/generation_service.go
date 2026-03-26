package chat

import (
	"context"
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) StreamAssistantReply(
	ctx context.Context,
	userID uint,
	conversationID uint,
	input SendMessageInput,
	emit func(StreamEvent) error,
) error {
	normalizedInput, err := s.normalizeSendInput(userID, input)
	if err != nil {
		return err
	}

	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	resolvedProvider, err := s.providers.ResolveForUser(userID)
	if err != nil {
		return err
	}
	settings, err := s.resolveSettings(conversation, normalizedInput.Options, resolvedProvider.Config.DefaultModel)
	if err != nil {
		return err
	}

	ctx, cleanup, err := s.registerActiveStream(ctx, conversation.ID)
	if err != nil {
		return err
	}
	defer cleanup()

	var assistantMessage models.Message
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		userMessage := models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleUser,
			Content:        normalizedInput.Content,
			Attachments:    normalizedInput.Attachments,
			Status:         models.MessageStatusCompleted,
		}
		if err := tx.Create(&userMessage).Error; err != nil {
			return fmt.Errorf("create user message: %w", err)
		}

		if strings.TrimSpace(conversation.Title) == "" || conversation.Title == defaultConversationTitle {
			title := deriveConversationTitle(normalizedInput.Content, normalizedInput.Attachments)
			if err := tx.Model(conversation).Updates(map[string]any{
				"title":      title,
				"updated_at": time.Now(),
			}).Error; err != nil {
				return fmt.Errorf("update conversation title: %w", err)
			}
			conversation.Title = title
		}

		assistantMessage = models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleAssistant,
			Content:        "",
			Status:         models.MessageStatusStreaming,
		}
		if err := tx.Create(&assistantMessage).Error; err != nil {
			return fmt.Errorf("create assistant placeholder: %w", err)
		}

		if err := tx.Model(conversation).Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	return s.streamIntoAssistantMessage(ctx, &assistantMessage, resolvedProvider.Config, history, settings, emit)
}

func (s *Service) RetryAssistantMessage(
	ctx context.Context,
	userID uint,
	conversationID uint,
	assistantMessageID uint,
	options *ConversationSettings,
	emit func(StreamEvent) error,
) error {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	resolvedProvider, err := s.providers.ResolveForUser(userID)
	if err != nil {
		return err
	}
	settings, err := s.resolveSettings(conversation, options, resolvedProvider.Config.DefaultModel)
	if err != nil {
		return err
	}

	ctx, cleanup, err := s.registerActiveStream(ctx, conversation.ID)
	if err != nil {
		return err
	}
	defer cleanup()

	assistantMessage, err := s.prepareAssistantRetry(conversation.ID, assistantMessageID)
	if err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	return s.streamIntoAssistantMessage(ctx, assistantMessage, resolvedProvider.Config, history, settings, emit)
}

func (s *Service) RegenerateLastAssistantReply(
	ctx context.Context,
	userID uint,
	conversationID uint,
	options *ConversationSettings,
	emit func(StreamEvent) error,
) error {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	latestMessage, err := latestConversationMessage(s.db, conversation.ID)
	if err != nil {
		return err
	}
	if latestMessage.Role != models.RoleAssistant {
		return ErrInvalidAssistantAction
	}

	return s.RetryAssistantMessage(ctx, userID, conversationID, latestMessage.ID, options, emit)
}

func (s *Service) EditUserMessageAndRegenerate(
	ctx context.Context,
	userID uint,
	conversationID uint,
	messageID uint,
	input SendMessageInput,
	emit func(StreamEvent) error,
) error {
	normalizedInput, err := s.normalizeSendInput(userID, input)
	if err != nil {
		return err
	}

	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	resolvedProvider, err := s.providers.ResolveForUser(userID)
	if err != nil {
		return err
	}
	settings, err := s.resolveSettings(conversation, normalizedInput.Options, resolvedProvider.Config.DefaultModel)
	if err != nil {
		return err
	}

	ctx, cleanup, err := s.registerActiveStream(ctx, conversation.ID)
	if err != nil {
		return err
	}
	defer cleanup()

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

		var trailingMessages []models.Message
		if err := tx.Where("conversation_id = ? AND id >= ?", conversation.ID, message.ID).
			Order("id asc").
			Find(&trailingMessages).Error; err != nil {
			return fmt.Errorf("load trailing messages: %w", err)
		}
		cleanupMessages = trailingMessages

		if err := tx.Model(message).Updates(map[string]any{
			"content":     normalizedInput.Content,
			"attachments": normalizedInput.Attachments,
			"status":      models.MessageStatusCompleted,
		}).Error; err != nil {
			return fmt.Errorf("update user message: %w", err)
		}

		if err := tx.Where("conversation_id = ? AND id > ?", conversation.ID, message.ID).Delete(&models.Message{}).Error; err != nil {
			return fmt.Errorf("delete trailing messages: %w", err)
		}

		if strings.TrimSpace(conversation.Title) == "" || conversation.Title == defaultConversationTitle {
			title := deriveConversationTitle(normalizedInput.Content, normalizedInput.Attachments)
			if err := tx.Model(conversation).Updates(map[string]any{
				"title":      title,
				"updated_at": time.Now(),
			}).Error; err != nil {
				return fmt.Errorf("update conversation title: %w", err)
			}
			conversation.Title = title
		}

		assistantMessage = models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleAssistant,
			Content:        "",
			Status:         models.MessageStatusStreaming,
		}
		if err := tx.Create(&assistantMessage).Error; err != nil {
			return fmt.Errorf("create assistant placeholder: %w", err)
		}

		if err := tx.Model(conversation).Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	if err := s.cleanupAttachments(cleanupMessages); err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	return s.streamIntoAssistantMessage(ctx, &assistantMessage, resolvedProvider.Config, history, settings, emit)
}
