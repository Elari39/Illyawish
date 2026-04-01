package chat

import (
	"context"
	"fmt"
	"strings"

	"backend/internal/models"
	"backend/internal/rag"
)

const knowledgeContextInstruction = `Use the knowledge base context below when it is relevant to the user's request. Prefer this context over guesswork, and say when the knowledge base does not contain the answer.`

func (s *Service) resolveKnowledgeAugmentation(
	ctx context.Context,
	conversation *models.Conversation,
	input *SendMessageInput,
) (string, models.AgentRunSummary, error) {
	summary := models.AgentRunSummary{
		KnowledgeSpaceIDs: []uint{},
		ToolCalls:         []models.AgentToolCallSummary{},
		Citations:         []models.AgentCitation{},
	}
	if s.searcher == nil || conversation == nil {
		return "", summary, nil
	}

	knowledgeSpaceIDs := cloneUintSlice(conversation.KnowledgeSpaceIDs)
	if input != nil && len(input.KnowledgeSpaceIDs) > 0 {
		knowledgeSpaceIDs = cloneUintSlice(input.KnowledgeSpaceIDs)
	}
	if len(knowledgeSpaceIDs) == 0 {
		return "", summary, nil
	}

	query := ""
	if input != nil {
		query = strings.TrimSpace(input.Content)
	}
	if query == "" {
		return "", summary, nil
	}

	result, err := s.searcher.Search(ctx, conversation.UserID, rag.SearchInput{
		Query:             query,
		KnowledgeSpaceIDs: knowledgeSpaceIDs,
		MaxResults:        6,
	}, rag.ProviderConfig{})
	if err != nil {
		return "", summary, fmt.Errorf("search knowledge base: %w", err)
	}

	summary.KnowledgeSpaceIDs = knowledgeSpaceIDs
	summary.Citations = append(summary.Citations, result.Citations...)
	return buildKnowledgeSystemPrompt(result), summary, nil
}

func buildKnowledgeSystemPrompt(result *rag.SearchResult) string {
	if result == nil || len(result.ContextBlocks) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString(knowledgeContextInstruction)
	builder.WriteString("\n\nKnowledge base context:\n")
	for index, block := range result.ContextBlocks {
		text := strings.TrimSpace(block)
		if text == "" {
			continue
		}
		builder.WriteString(fmt.Sprintf("[%d] %s\n", index+1, text))
	}

	return strings.TrimSpace(builder.String())
}

func mergeSystemPromptWithKnowledgeContext(systemPrompt string, knowledgePrompt string) string {
	systemPrompt = strings.TrimSpace(systemPrompt)
	knowledgePrompt = strings.TrimSpace(knowledgePrompt)

	switch {
	case systemPrompt == "":
		return knowledgePrompt
	case knowledgePrompt == "":
		return systemPrompt
	default:
		return systemPrompt + "\n\n" + knowledgePrompt
	}
}
