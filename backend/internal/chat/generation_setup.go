package chat

import (
	"context"
	"fmt"
	"strings"

	"backend/internal/llm"
	"backend/internal/models"
)

type generationRequest struct {
	settings       ConversationSettings
	providerConfig llm.ProviderConfig
	history        []llm.ChatMessage
	runSummary     models.AgentRunSummary
}

func (s *Service) buildGenerationRequest(
	ctx context.Context,
	userID uint,
	conversation *models.Conversation,
	assistantMessageID uint,
	override *ConversationSettings,
	input *SendMessageInput,
) (generationRequest, error) {
	settings, providerConfig, systemPrompt, err := s.resolveGenerationConfig(userID, conversation, override)
	if err != nil {
		return generationRequest{}, err
	}

	history, runSummary, err := s.buildGenerationHistory(
		ctx,
		conversation,
		assistantMessageID,
		systemPrompt,
		settings.ContextWindowTurns,
		input,
	)
	if err != nil {
		return generationRequest{}, err
	}

	return generationRequest{
		settings:       settings,
		providerConfig: providerConfig,
		history:        history,
		runSummary:     runSummary,
	}, nil
}

func (s *Service) resolveGenerationConfig(
	userID uint,
	conversation *models.Conversation,
	override *ConversationSettings,
) (ConversationSettings, llm.ProviderConfig, string, error) {
	settings, err := s.resolveSettings(userID, conversation, override, "")
	if err != nil {
		return ConversationSettings{}, llm.ProviderConfig{}, "", err
	}

	resolvedProvider, err := s.providers.ResolveForUser(userID, settings.ProviderPresetID)
	if err != nil {
		return ConversationSettings{}, llm.ProviderConfig{}, "", err
	}
	if settings.Model == "" {
		settings.Model = resolvedProvider.Config.DefaultModel
	}

	systemPrompt, err := s.resolveSystemPrompt(userID, settings.SystemPrompt)
	if err != nil {
		return ConversationSettings{}, llm.ProviderConfig{}, "", err
	}

	return settings, resolvedProvider.Config, systemPrompt, nil
}

func (s *Service) buildGenerationHistory(
	ctx context.Context,
	conversation *models.Conversation,
	assistantMessageID uint,
	systemPrompt string,
	contextWindowTurns *int,
	input *SendMessageInput,
) ([]llm.ChatMessage, models.AgentRunSummary, error) {
	history, err := s.historyForModel(conversation.ID, assistantMessageID, systemPrompt, contextWindowTurns)
	if err != nil {
		return nil, models.AgentRunSummary{}, err
	}

	knowledgePrompt, runSummary, err := s.resolveKnowledgeAugmentation(ctx, conversation, input)
	if err != nil {
		return nil, models.AgentRunSummary{}, err
	}
	if knowledgePrompt == "" {
		return history, runSummary, nil
	}

	history, err = s.historyForModel(
		conversation.ID,
		assistantMessageID,
		mergeSystemPromptWithKnowledgeContext(systemPrompt, knowledgePrompt),
		contextWindowTurns,
	)
	if err != nil {
		return nil, models.AgentRunSummary{}, err
	}
	return history, runSummary, nil
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
