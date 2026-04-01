package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/gorm"
)

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

		var trailingMessages []models.Message
		if err := tx.Where("conversation_id = ? AND id >= ?", conversationID, message.ID).
			Order("id asc").
			Find(&trailingMessages).Error; err != nil {
			return fmt.Errorf("load trailing messages: %w", err)
		}
		if err := hydrateMessageAttachments(tx, trailingMessages); err != nil {
			return err
		}
		cleanupMessages = trailingMessages

		if err := updateMessageRecord(
			tx,
			message,
			"",
			nil,
			models.MessageStatusStreaming,
		); err != nil {
			return fmt.Errorf("reset assistant message: %w", err)
		}

		if err := tx.Where("conversation_id = ? AND id > ?", conversationID, message.ID).
			Delete(&models.Message{}).Error; err != nil {
			return fmt.Errorf("delete trailing messages: %w", err)
		}

		if err := tx.Model(&models.Conversation{}).
			Where("id = ?", conversationID).
			Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
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

func (s *Service) streamIntoAssistantMessage(
	ctx context.Context,
	run *activeRun,
	assistantMessage *models.Message,
	conversationPublicID string,
	providerConfig llm.ProviderConfig,
	history []llm.ChatMessage,
	settings ConversationSettings,
	runSummary *models.AgentRunSummary,
	emit func(StreamEvent) error,
) error {
	if err := emit(StreamEvent{
		Type:    "message_start",
		Message: ToMessageDTO(assistantMessage, conversationPublicID),
	}); err != nil {
		return err
	}

	ctx, cancelStream := context.WithCancel(ctx)
	defer cancelStream()

	streamOptions := llm.RequestOptions{
		Model:       settings.Model,
		Temperature: cloneFloat32(settings.Temperature),
		MaxTokens:   cloneInt(settings.MaxTokens),
	}

	buffer := &assistantResponseBuffer{}
	var emitErr error
	emitStreamEvent := func(event StreamEvent) bool {
		if emitErr != nil {
			return false
		}
		if err := emit(event); err != nil {
			emitErr = err
			cancelStream()
			return false
		}
		return true
	}

	streamResult, streamErr := s.model.Stream(ctx, providerConfig, history, streamOptions, func(delta llm.StreamDelta) {
		if emitErr != nil {
			return
		}
		if (delta.Content == "" && delta.Reasoning == "") || emitErr != nil {
			return
		}
		buffer.applyDelta(delta.Content, delta.Reasoning, emitStreamEvent)
	})

	finalContent := buffer.content
	finalReasoning := buffer.reasoningContent

	if emitErr != nil && streamErr == nil {
		streamErr = emitErr
	}

	if shouldAutoContinue(streamResult, streamErr) {
		continueHistory := append(history, llm.ChatMessage{
			Role:    models.RoleAssistant,
			Content: finalContent,
		}, llm.ChatMessage{
			Role:    models.RoleUser,
			Content: continueAssistantPrompt,
		})

		continueResult, continueErr := s.model.Stream(ctx, providerConfig, continueHistory, streamOptions, func(delta llm.StreamDelta) {
			if emitErr != nil {
				return
			}
			if (delta.Content == "" && delta.Reasoning == "") || emitErr != nil {
				return
			}
			buffer.applyDelta(delta.Content, delta.Reasoning, emitStreamEvent)
		})
		finalContent = buffer.content
		finalReasoning = buffer.reasoningContent
		streamResult = continueResult
		streamErr = continueErr
	}

	if emitErr != nil && streamErr == nil {
		streamErr = emitErr
	}

	buffer.finishReasoning(emitStreamEvent)
	finalContent = buffer.content
	finalReasoning = buffer.reasoningContent

	if streamErr != nil {
		status := models.MessageStatusFailed
		eventType := "error"
		if errors.Is(streamErr, context.Canceled) &&
			(run.getCancelReason() == runCancelReasonUser || run.getCancelReason() == runCancelReasonDetached) {
			status = models.MessageStatusCancelled
			eventType = "cancelled"
		}

		assistantMessage.Content = finalContent
		assistantMessage.ReasoningContent = finalReasoning
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

		if emitErr != nil {
			return emitErr
		}
		emitStreamEvent(StreamEvent{
			Type:    eventType,
			Error:   streamErr.Error(),
			Message: ToMessageDTO(assistantMessage, conversationPublicID),
		})
		return nil
	}

	assistantMessage.Content = finalContent
	assistantMessage.ReasoningContent = finalReasoning
	assistantMessage.Status = models.MessageStatusCompleted
	assistantMessage.RunSummary = models.AgentRunSummary{}
	if runSummary != nil {
		assistantMessage.RunSummary = *runSummary
	}
	if err := s.db.Model(assistantMessage).
		Select("content", "reasoning_content", "status", "run_summary").
		Updates(assistantMessage).Error; err != nil {
		return fmt.Errorf("complete assistant message: %w", err)
	}

	if emitErr != nil {
		return emitErr
	}
	doneEvent := StreamEvent{
		Type:    "done",
		Message: ToMessageDTO(assistantMessage, conversationPublicID),
	}
	if runSummary != nil {
		doneEvent.Citations = append([]models.AgentCitation(nil), runSummary.Citations...)
	}
	return emit(doneEvent)
}

func (s *Service) historyForModel(
	conversationID uint,
	beforeMessageID uint,
	systemPrompt string,
	contextWindowTurns *int,
) ([]llm.ChatMessage, error) {
	query := s.db.Where("conversation_id = ?", conversationID).Order("id asc")
	if beforeMessageID > 0 {
		query = query.Where("id < ?", beforeMessageID)
	}

	var messages []models.Message
	if err := query.Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("load conversation history: %w", err)
	}
	if err := hydrateMessageAttachments(s.db, messages); err != nil {
		return nil, err
	}

	history := make([]llm.ChatMessage, 0, len(messages))

	for _, message := range messages {
		if !includeMessageInHistory(message) {
			continue
		}

		modelAttachments := []llm.Attachment{}
		if len(message.Attachments) > 0 {
			if s.uploads == nil {
				return nil, requestError{message: "attachments are unavailable"}
			}

			var err error
			modelAttachments, err = s.uploads.BuildModelAttachments(message.Attachments)
			if err != nil {
				return nil, err
			}
		}
		history = append(history, llm.ChatMessage{
			Role:        message.Role,
			Content:     message.Content,
			Attachments: modelAttachments,
		})
	}

	history = trimHistoryToRecentTurns(history, contextWindowTurns)
	if strings.TrimSpace(systemPrompt) != "" {
		history = append([]llm.ChatMessage{{
			Role:    models.RoleSystem,
			Content: systemPrompt,
		}}, history...)
	}

	return history, nil
}

func (s *Service) registerActiveStream(
	conversationID uint,
) (*activeRun, error) {
	s.activeMu.Lock()
	if _, exists := s.activeStreams[conversationID]; exists {
		s.activeMu.Unlock()
		return nil, ErrConversationBusy
	}
	run := newActiveRun(conversationID)
	s.activeStreams[conversationID] = run
	s.activeMu.Unlock()

	return run, nil
}

func (s *Service) finishActiveStream(conversationID uint, run *activeRun) {
	run.finish()
	run.cancel()

	s.activeMu.Lock()
	if current, exists := s.activeStreams[conversationID]; exists && current == run {
		delete(s.activeStreams, conversationID)
	}
	s.activeMu.Unlock()
}

func (s *Service) withActiveStream(conversationID uint, fn func(*activeRun) error) error {
	s.activeMu.Lock()
	run, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()
	if !exists {
		return ErrNoActiveStream
	}

	return fn(run)
}

func (s *Service) streamActiveRun(
	requestCtx context.Context,
	conversationID uint,
	afterSeq int,
	emit func(StreamEvent) error,
) error {
	return s.withActiveStream(conversationID, func(run *activeRun) error {
		events, subscriber, unsubscribe := run.subscribe(afterSeq)
		cleanupSubscription := func() {
			unsubscribe()
			s.scheduleDetachCancellation(conversationID, run)
		}
		defer cleanupSubscription()

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
	})
}

func (s *Service) waitForActiveRunCompletion(
	ctx context.Context,
	conversationID uint,
) bool {
	s.activeMu.Lock()
	run, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()
	if !exists {
		return true
	}

	return run.wait(ctx)
}

func (s *Service) scheduleDetachCancellation(conversationID uint, run *activeRun) {
	run.mu.Lock()
	defer run.mu.Unlock()

	if run.finished || len(run.subscribers) > 0 || run.detachTimer != nil {
		return
	}

	done := run.done
	run.detachTimer = time.AfterFunc(s.detachTimeout, func() {
		run.setCancelReason(runCancelReasonDetached)
		run.cancel()
		<-done
	})
}

func (s *Service) publishActiveRunError(run *activeRun, err error) {
	if err == nil {
		return
	}

	run.publish(StreamEvent{
		Type:  "error",
		Error: errorMessage(err),
	})
}
