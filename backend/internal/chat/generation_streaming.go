package chat

import (
	"context"
	"errors"
	"fmt"

	"backend/internal/llm"
	"backend/internal/models"
)

func (s *Service) runAssistantStream(
	ctx context.Context,
	conversation *models.Conversation,
	assistantMessage *models.Message,
	request generationRequest,
	emit func(StreamEvent) error,
) error {
	return s.launchActiveRun(ctx, conversation.ID, func(run *activeRun) error {
		return s.streamIntoAssistantMessage(
			run.ctx,
			run,
			assistantMessage,
			conversation.PublicID,
			request.providerConfig,
			request.history,
			request.settings,
			&request.runSummary,
			func(event StreamEvent) error {
				run.publish(event)
				return nil
			},
		)
	}, emit)
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

	streamResult, streamErr := s.streamAssistantResponse(
		ctx,
		providerConfig,
		history,
		streamOptions,
		buffer,
		emitStreamEvent,
	)
	finalContent, finalReasoning := buffer.content, buffer.reasoningContent

	if emitErr != nil && streamErr == nil {
		streamErr = emitErr
	}

	if shouldAutoContinue(streamResult, streamErr) {
		streamResult, streamErr = s.continueAssistantResponse(
			ctx,
			providerConfig,
			history,
			streamOptions,
			buffer,
			finalContent,
			emitStreamEvent,
		)
		finalContent, finalReasoning = buffer.content, buffer.reasoningContent
	}

	if emitErr != nil && streamErr == nil {
		streamErr = emitErr
	}

	buffer.finishReasoning(emitStreamEvent)
	finalContent, finalReasoning = buffer.content, buffer.reasoningContent

	if streamErr != nil {
		return s.completeFailedAssistantStream(
			run,
			assistantMessage,
			conversationPublicID,
			finalContent,
			finalReasoning,
			streamErr,
			runSummary,
			emitErr,
			emitStreamEvent,
		)
	}

	if err := s.finalizeAssistantMessage(
		assistantMessage,
		finalContent,
		finalReasoning,
		models.MessageStatusCompleted,
		runSummary,
	); err != nil {
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

func (s *Service) streamAssistantResponse(
	ctx context.Context,
	providerConfig llm.ProviderConfig,
	history []llm.ChatMessage,
	streamOptions llm.RequestOptions,
	buffer *assistantResponseBuffer,
	emitStreamEvent func(StreamEvent) bool,
) (llm.StreamResult, error) {
	return s.model.Stream(ctx, providerConfig, history, streamOptions, func(delta llm.StreamDelta) {
		if delta.Content == "" && delta.Reasoning == "" {
			return
		}
		buffer.applyDelta(delta.Content, delta.Reasoning, emitStreamEvent)
	})
}

func (s *Service) continueAssistantResponse(
	ctx context.Context,
	providerConfig llm.ProviderConfig,
	history []llm.ChatMessage,
	streamOptions llm.RequestOptions,
	buffer *assistantResponseBuffer,
	currentContent string,
	emitStreamEvent func(StreamEvent) bool,
) (llm.StreamResult, error) {
	continueHistory := append(history, llm.ChatMessage{
		Role:    models.RoleAssistant,
		Content: currentContent,
	}, llm.ChatMessage{
		Role:    models.RoleUser,
		Content: continueAssistantPrompt,
	})

	return s.model.Stream(ctx, providerConfig, continueHistory, streamOptions, func(delta llm.StreamDelta) {
		if delta.Content == "" && delta.Reasoning == "" {
			return
		}
		buffer.applyDelta(delta.Content, delta.Reasoning, emitStreamEvent)
	})
}

func (s *Service) completeFailedAssistantStream(
	run *activeRun,
	assistantMessage *models.Message,
	conversationPublicID string,
	content string,
	reasoning string,
	streamErr error,
	runSummary *models.AgentRunSummary,
	emitErr error,
	emitStreamEvent func(StreamEvent) bool,
) error {
	status := models.MessageStatusFailed
	eventType := "error"
	if errors.Is(streamErr, context.Canceled) &&
		(run.getCancelReason() == runCancelReasonUser || run.getCancelReason() == runCancelReasonDetached) {
		status = models.MessageStatusCancelled
		eventType = "cancelled"
	}

	if err := s.finalizeAssistantMessage(assistantMessage, content, reasoning, status, runSummary); err != nil {
		return err
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
