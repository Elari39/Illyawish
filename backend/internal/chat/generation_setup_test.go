package chat

import (
	"context"
	"strings"
	"testing"

	"backend/internal/models"
	"backend/internal/rag"
)

func TestBuildGenerationHistoryMergesKnowledgePromptIntoSystemMessage(t *testing.T) {
	db, _, conversation := newChatTestContext(t)
	conversation.KnowledgeSpaceIDs = []uint{3, 5}
	if err := db.Save(&conversation).Error; err != nil {
		t.Fatalf("save conversation: %v", err)
	}

	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{}).
		WithKnowledgeSearcher(&fakeKnowledgeSearcher{
			result: &rag.SearchResult{
				ContextBlocks: []string{"Doc excerpt"},
				Citations: []models.AgentCitation{{
					DocumentID:   9,
					DocumentName: "Guide",
					ChunkID:      11,
					Snippet:      "Doc excerpt",
				}},
			},
		})

	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Question one",
		Status:         models.MessageStatusCompleted,
	})
	assistantMessage := &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "",
		Status:         models.MessageStatusStreaming,
	}
	mustCreateMessageRecord(t, db, assistantMessage)

	history, runSummary, err := service.buildGenerationHistory(
		context.Background(),
		&conversation,
		assistantMessage.ID,
		"Session prompt",
		ptrInt(4),
		&SendMessageInput{
			Content: "Look up the docs",
		},
	)
	if err != nil {
		t.Fatalf("buildGenerationHistory() error = %v", err)
	}

	if len(history) != 2 {
		t.Fatalf("expected system and user messages, got %#v", history)
	}
	if history[0].Role != models.RoleSystem {
		t.Fatalf("expected system message first, got %#v", history[0])
	}
	if !strings.Contains(history[0].Content, "Session prompt") {
		t.Fatalf("expected original system prompt to remain, got %q", history[0].Content)
	}
	if !strings.Contains(history[0].Content, "Knowledge base context:") {
		t.Fatalf("expected knowledge prompt to be merged, got %q", history[0].Content)
	}
	if history[1].Content != "Question one" {
		t.Fatalf("expected prior user message in history, got %#v", history[1])
	}
	if len(runSummary.KnowledgeSpaceIDs) != 2 || runSummary.KnowledgeSpaceIDs[0] != 3 || runSummary.KnowledgeSpaceIDs[1] != 5 {
		t.Fatalf("expected knowledge space ids in summary, got %#v", runSummary.KnowledgeSpaceIDs)
	}
	if len(runSummary.Citations) != 1 || runSummary.Citations[0].DocumentID != 9 {
		t.Fatalf("expected citations in summary, got %#v", runSummary.Citations)
	}
}
