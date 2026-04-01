package chat

import (
	"context"
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) launchActiveRun(
	requestCtx context.Context,
	conversationID uint,
	execute func(run *activeRun) error,
	emit func(StreamEvent) error,
) error {
	run, err := s.registerActiveStream(conversationID)
	if err != nil {
		return err
	}

	events, subscriber, unsubscribe := run.subscribe(0)
	cleanupSubscription := func() {
		unsubscribe()
		s.scheduleDetachCancellation(conversationID, run)
	}
	defer cleanupSubscription()

	go func() {
		defer s.finishActiveStream(conversationID, run)
		s.publishActiveRunError(run, execute(run))
	}()

	for _, event := range events {
		if err := emit(event); err != nil {
			return nil
		}
	}

	for {
		select {
		case <-requestCtx.Done():
			return nil
		case event, ok := <-subscriber:
			if !ok {
				return nil
			}
			if err := emit(event); err != nil {
				return nil
			}
		}
	}
}

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
	if err := s.enforceDailyMessageQuota(userID); err != nil {
		return err
	}

	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	settings, err := s.resolveSettings(userID, conversation, normalizedInput.Options, "")
	if err != nil {
		return err
	}
	resolvedProvider, err := s.providers.ResolveForUser(userID, settings.ProviderPresetID)
	if err != nil {
		return err
	}
	if settings.Model == "" {
		settings.Model = resolvedProvider.Config.DefaultModel
	}
	systemPrompt, err := s.resolveSystemPrompt(userID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	var assistantMessage models.Message
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		userMessage := models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleUser,
			Content:        normalizedInput.Content,
			Attachments:    normalizedInput.Attachments,
			Status:         models.MessageStatusCompleted,
		}
		if err := createMessageRecord(tx, &userMessage); err != nil {
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
		if err := createMessageRecord(tx, &assistantMessage); err != nil {
			return fmt.Errorf("create assistant placeholder: %w", err)
		}

		if err := tx.Model(conversation).Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, systemPrompt, settings.ContextWindowTurns)
	if err != nil {
		return err
	}
	knowledgePrompt, runSummary, err := s.resolveKnowledgeAugmentation(ctx, conversation, normalizedInput)
	if err != nil {
		return err
	}
	if knowledgePrompt != "" {
		history, err = s.historyForModel(
			conversation.ID,
			assistantMessage.ID,
			mergeSystemPromptWithKnowledgeContext(systemPrompt, knowledgePrompt),
			settings.ContextWindowTurns,
		)
		if err != nil {
			return err
		}
	}

	return s.launchActiveRun(ctx, conversation.ID, func(run *activeRun) error {
		return s.streamIntoAssistantMessage(
			run.ctx,
			run,
			&assistantMessage,
			conversation.PublicID,
			resolvedProvider.Config,
			history,
			settings,
			&runSummary,
			func(event StreamEvent) error {
				run.publish(event)
				return nil
			},
		)
	}, emit)
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

	settings, err := s.resolveSettings(userID, conversation, options, "")
	if err != nil {
		return err
	}
	resolvedProvider, err := s.providers.ResolveForUser(userID, settings.ProviderPresetID)
	if err != nil {
		return err
	}
	if settings.Model == "" {
		settings.Model = resolvedProvider.Config.DefaultModel
	}
	systemPrompt, err := s.resolveSystemPrompt(userID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	assistantMessage, cleanupMessages, err := s.prepareAssistantReplay(
		conversation.ID,
		assistantMessageID,
		ErrInvalidRetryAction,
		models.MessageStatusFailed,
		models.MessageStatusCancelled,
	)
	if err != nil {
		return err
	}
	if err := s.cleanupAttachments(cleanupMessages); err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, systemPrompt, settings.ContextWindowTurns)
	if err != nil {
		return err
	}
	previousUser, err := previousUserMessage(s.db, conversation.ID, assistantMessage.ID)
	if err != nil {
		return err
	}
	knowledgePrompt, runSummary, err := s.resolveKnowledgeAugmentation(ctx, conversation, &SendMessageInput{
		Content: previousUser.Content,
	})
	if err != nil {
		return err
	}
	if knowledgePrompt != "" {
		history, err = s.historyForModel(
			conversation.ID,
			assistantMessage.ID,
			mergeSystemPromptWithKnowledgeContext(systemPrompt, knowledgePrompt),
			settings.ContextWindowTurns,
		)
		if err != nil {
			return err
		}
	}

	return s.launchActiveRun(ctx, conversation.ID, func(run *activeRun) error {
		return s.streamIntoAssistantMessage(
			run.ctx,
			run,
			assistantMessage,
			conversation.PublicID,
			resolvedProvider.Config,
			history,
			settings,
			&runSummary,
			func(event StreamEvent) error {
				run.publish(event)
				return nil
			},
		)
	}, emit)
}

func (s *Service) RegenerateAssistantMessage(
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

	settings, err := s.resolveSettings(userID, conversation, options, "")
	if err != nil {
		return err
	}
	resolvedProvider, err := s.providers.ResolveForUser(userID, settings.ProviderPresetID)
	if err != nil {
		return err
	}
	if settings.Model == "" {
		settings.Model = resolvedProvider.Config.DefaultModel
	}
	systemPrompt, err := s.resolveSystemPrompt(userID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	assistantMessage, cleanupMessages, err := s.prepareAssistantReplay(
		conversation.ID,
		assistantMessageID,
		ErrInvalidRegenerateAction,
		models.MessageStatusCompleted,
	)
	if err != nil {
		return err
	}
	if err := s.cleanupAttachments(cleanupMessages); err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, systemPrompt, settings.ContextWindowTurns)
	if err != nil {
		return err
	}
	previousUser, err := previousUserMessage(s.db, conversation.ID, assistantMessage.ID)
	if err != nil {
		return err
	}
	knowledgePrompt, runSummary, err := s.resolveKnowledgeAugmentation(ctx, conversation, &SendMessageInput{
		Content: previousUser.Content,
	})
	if err != nil {
		return err
	}
	if knowledgePrompt != "" {
		history, err = s.historyForModel(
			conversation.ID,
			assistantMessage.ID,
			mergeSystemPromptWithKnowledgeContext(systemPrompt, knowledgePrompt),
			settings.ContextWindowTurns,
		)
		if err != nil {
			return err
		}
	}

	return s.launchActiveRun(ctx, conversation.ID, func(run *activeRun) error {
		return s.streamIntoAssistantMessage(
			run.ctx,
			run,
			assistantMessage,
			conversation.PublicID,
			resolvedProvider.Config,
			history,
			settings,
			&runSummary,
			func(event StreamEvent) error {
				run.publish(event)
				return nil
			},
		)
	}, emit)
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

	return s.RegenerateAssistantMessage(ctx, userID, conversationID, latestMessage.ID, options, emit)
}

func (s *Service) ResumeActiveStream(
	ctx context.Context,
	userID uint,
	conversationID uint,
	afterSeq int,
	emit func(StreamEvent) error,
) error {
	if _, err := s.GetConversation(userID, conversationID); err != nil {
		return err
	}

	return s.streamActiveRun(ctx, conversationID, afterSeq, emit)
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

	settings, err := s.resolveSettings(userID, conversation, normalizedInput.Options, "")
	if err != nil {
		return err
	}
	resolvedProvider, err := s.providers.ResolveForUser(userID, settings.ProviderPresetID)
	if err != nil {
		return err
	}
	if settings.Model == "" {
		settings.Model = resolvedProvider.Config.DefaultModel
	}
	systemPrompt, err := s.resolveSystemPrompt(userID, settings.SystemPrompt)
	if err != nil {
		return err
	}

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

		if err := updateMessageRecord(
			tx,
			message,
			normalizedInput.Content,
			normalizedInput.Attachments,
			models.MessageStatusCompleted,
		); err != nil {
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
		if err := createMessageRecord(tx, &assistantMessage); err != nil {
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

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, systemPrompt, settings.ContextWindowTurns)
	if err != nil {
		return err
	}
	knowledgePrompt, runSummary, err := s.resolveKnowledgeAugmentation(ctx, conversation, normalizedInput)
	if err != nil {
		return err
	}
	if knowledgePrompt != "" {
		history, err = s.historyForModel(
			conversation.ID,
			assistantMessage.ID,
			mergeSystemPromptWithKnowledgeContext(systemPrompt, knowledgePrompt),
			settings.ContextWindowTurns,
		)
		if err != nil {
			return err
		}
	}

	return s.launchActiveRun(ctx, conversation.ID, func(run *activeRun) error {
		return s.streamIntoAssistantMessage(
			run.ctx,
			run,
			&assistantMessage,
			conversation.PublicID,
			resolvedProvider.Config,
			history,
			settings,
			&runSummary,
			func(event StreamEvent) error {
				run.publish(event)
				return nil
			},
		)
	}, emit)
}
