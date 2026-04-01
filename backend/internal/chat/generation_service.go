package chat

import (
	"context"

	"backend/internal/models"
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
	if err := s.enforceDailyMessageQuota(userID); err != nil {
		return err
	}
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	assistantMessage, err := s.createAssistantReply(conversation, normalizedInput)
	if err != nil {
		return err
	}
	request, err := s.buildGenerationRequest(
		ctx,
		userID,
		conversation,
		assistantMessage.ID,
		normalizedInput.Options,
		normalizedInput,
	)
	if err != nil {
		return err
	}

	return s.runAssistantStream(ctx, conversation, &assistantMessage, request, emit)
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

	previousUser, err := previousUserMessage(s.db, conversation.ID, assistantMessage.ID)
	if err != nil {
		return err
	}
	request, err := s.buildGenerationRequest(ctx, userID, conversation, assistantMessage.ID, options, &SendMessageInput{
		Content: previousUser.Content,
	})
	if err != nil {
		return err
	}

	return s.runAssistantStream(ctx, conversation, assistantMessage, request, emit)
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

	previousUser, err := previousUserMessage(s.db, conversation.ID, assistantMessage.ID)
	if err != nil {
		return err
	}
	request, err := s.buildGenerationRequest(ctx, userID, conversation, assistantMessage.ID, options, &SendMessageInput{
		Content: previousUser.Content,
	})
	if err != nil {
		return err
	}

	return s.runAssistantStream(ctx, conversation, assistantMessage, request, emit)
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

	assistantMessage, cleanupMessages, err := s.editUserMessageForRegeneration(
		conversation,
		messageID,
		normalizedInput,
	)
	if err != nil {
		return err
	}

	if err := s.cleanupAttachments(cleanupMessages); err != nil {
		return err
	}

	request, err := s.buildGenerationRequest(
		ctx,
		userID,
		conversation,
		assistantMessage.ID,
		normalizedInput.Options,
		normalizedInput,
	)
	if err != nil {
		return err
	}

	return s.runAssistantStream(ctx, conversation, &assistantMessage, request, emit)
}
