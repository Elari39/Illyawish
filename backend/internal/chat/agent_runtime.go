package chat

import (
	"context"
	"errors"
	"fmt"

	"backend/internal/agent"
	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/workflow"
)

func (s *Service) shouldUseAgentRuntime(conversation *models.Conversation, input *SendMessageInput) bool {
	if s.agent == nil {
		return false
	}
	if input != nil {
		if input.WorkflowPresetID != nil || len(input.KnowledgeSpaceIDs) > 0 || len(input.WorkflowInputs) > 0 {
			return true
		}
	}
	return conversation != nil && (conversation.WorkflowPresetID != nil || len(conversation.KnowledgeSpaceIDs) > 0)
}

type agentRunConfiguration struct {
	knowledgeSpaceIDs []uint
	workflowPresetID  *uint
	workflowInputs    map[string]any
	templateKey       string
}

func (s *Service) streamAgentIntoAssistantMessage(
	ctx context.Context,
	run *activeRun,
	conversation *models.Conversation,
	assistantMessage *models.Message,
	providerConfig llm.ProviderConfig,
	input *SendMessageInput,
	emit func(StreamEvent) error,
) error {
	if err := emit(StreamEvent{
		Type:    "message_start",
		Message: ToMessageDTO(assistantMessage, conversation.PublicID),
	}); err != nil {
		return err
	}

	runConfig, err := s.resolveAgentRunConfiguration(conversation.UserID, conversation, input)
	if err != nil {
		if updateErr := s.db.Model(assistantMessage).Updates(map[string]any{
			"status":            models.MessageStatusFailed,
			"content":           assistantMessage.Content,
			"reasoning_content": assistantMessage.ReasoningContent,
		}).Error; updateErr != nil {
			return fmt.Errorf("fail assistant message after agent config error: %w", updateErr)
		}
		return err
	}

	result, err := s.agent.Execute(ctx, agent.RunInput{
		UserID:              conversation.UserID,
		ConversationID:      conversation.ID,
		UserMessage:         input.Content,
		WorkflowTemplateKey: runConfig.templateKey,
		WorkflowPresetID:    runConfig.workflowPresetID,
		KnowledgeSpaceIDs:   runConfig.knowledgeSpaceIDs,
		WorkflowInputs:      runConfig.workflowInputs,
		Provider:            providerConfig,
	}, func(event agent.Event) error {
		if event.StepName == "" {
			switch event.Type {
			case agent.EventTypeMessageDelta:
				assistantMessage.Content += event.Content
			case agent.EventTypeReasoningDelta:
				assistantMessage.ReasoningContent += event.Content
			}
		}
		return emit(StreamEvent{
			Type:           event.Type,
			Content:        event.Content,
			StepName:       event.StepName,
			ToolName:       event.ToolName,
			ConfirmationID: event.ConfirmationID,
			Citations:      event.Citations,
			Metadata:       event.Metadata,
		})
	})
	if err != nil {
		status := models.MessageStatusFailed
		eventType := "error"
		if errors.Is(err, context.Canceled) &&
			(run.getCancelReason() == runCancelReasonUser || run.getCancelReason() == runCancelReasonDetached) {
			status = models.MessageStatusCancelled
			eventType = "cancelled"
		}
		if updateErr := s.db.Model(assistantMessage).Updates(map[string]any{
			"status":            status,
			"content":           assistantMessage.Content,
			"reasoning_content": assistantMessage.ReasoningContent,
		}).Error; updateErr != nil {
			return fmt.Errorf("fail assistant message after agent error: %w", updateErr)
		}
		assistantMessage.Status = status
		if eventType == "cancelled" || eventType == "error" {
			return emit(StreamEvent{
				Type:    eventType,
				Error:   err.Error(),
				Message: ToMessageDTO(assistantMessage, conversation.PublicID),
			})
		}
		return err
	}

	assistantMessage.Content = result.Content
	assistantMessage.ReasoningContent = result.ReasoningContent
	assistantMessage.Status = models.MessageStatusCompleted
	assistantMessage.RunSummary = result.RunSummary
	if err := s.db.Model(assistantMessage).
		Select("content", "reasoning_content", "status", "run_summary").
		Updates(assistantMessage).Error; err != nil {
		return fmt.Errorf("complete agent assistant message: %w", err)
	}

	return emit(StreamEvent{
		Type:      "done",
		Message:   ToMessageDTO(assistantMessage, conversation.PublicID),
		Citations: result.RunSummary.Citations,
	})
}

func (s *Service) resolveAgentRunConfiguration(
	userID uint,
	conversation *models.Conversation,
	input *SendMessageInput,
) (agentRunConfiguration, error) {
	runConfig := agentRunConfiguration{
		knowledgeSpaceIDs: cloneUintSlice(conversation.KnowledgeSpaceIDs),
		workflowPresetID:  conversation.WorkflowPresetID,
		workflowInputs:    cloneWorkflowInputs(nil),
	}
	if input != nil {
		if len(input.KnowledgeSpaceIDs) > 0 {
			runConfig.knowledgeSpaceIDs = cloneUintSlice(input.KnowledgeSpaceIDs)
		}
		if input.WorkflowPresetID != nil {
			runConfig.workflowPresetID = input.WorkflowPresetID
		}
		runConfig.workflowInputs = cloneWorkflowInputs(input.WorkflowInputs)
	}

	if runConfig.workflowPresetID != nil && s.workflowPresets != nil {
		preset, err := s.workflowPresets.GetPreset(userID, *runConfig.workflowPresetID)
		if err != nil {
			return agentRunConfiguration{}, err
		}
		runConfig.templateKey = preset.TemplateKey
		runConfig.workflowInputs = mergeWorkflowInputs(preset.DefaultInputs, runConfig.workflowInputs)
		if len(runConfig.knowledgeSpaceIDs) == 0 {
			runConfig.knowledgeSpaceIDs = cloneUintSlice(preset.KnowledgeSpaceIDs)
		}
	}

	runConfig.templateKey = resolveAgentTemplateKey(runConfig.templateKey, runConfig.workflowInputs)
	return runConfig, nil
}

func resolveAgentTemplateKey(current string, workflowInputs map[string]any) string {
	if current != "" {
		return current
	}
	if workflowInputs != nil {
		if raw, ok := workflowInputs["templateKey"].(string); ok && raw != "" {
			return raw
		}
	}
	return workflow.TemplateKnowledgeQA
}

func cloneWorkflowInputs(values map[string]any) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func mergeWorkflowInputs(defaults map[string]any, overrides map[string]any) map[string]any {
	merged := cloneWorkflowInputs(defaults)
	for key, value := range overrides {
		merged[key] = value
	}
	return merged
}
