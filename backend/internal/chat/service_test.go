package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/provider"
	"backend/internal/rag"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type fakeChatModel struct {
	chunks          []string
	reasoningChunks []string
	finishReason    string
	err             error
	responses       []fakeStreamResponse
	callHistories   [][]llm.ChatMessage
	lastHistory     []llm.ChatMessage
	lastProvider    llm.ProviderConfig
	lastOptions     llm.RequestOptions
	callCount       int
}

type fakeStreamResponse struct {
	chunks          []string
	reasoningChunks []string
	deltas          []llm.StreamDelta
	finishReason    string
	err             error
}

type blockingChatModel struct {
	started chan struct{}
	done    chan struct{}
}

func (m *blockingChatModel) Stream(
	ctx context.Context,
	_ llm.ProviderConfig,
	_ []llm.ChatMessage,
	_ llm.RequestOptions,
	onDelta func(llm.StreamDelta),
) (llm.StreamResult, error) {
	select {
	case <-m.started:
	default:
		close(m.started)
	}

	if onDelta != nil {
		onDelta(llm.StreamDelta{Reasoning: "thinking"})
		onDelta(llm.StreamDelta{Content: "partial"})
	}

	<-ctx.Done()
	close(m.done)
	return llm.StreamResult{
		Content:          "partial",
		ReasoningContent: "thinking",
	}, ctx.Err()
}

type delayedChatModel struct {
	delay time.Duration
}

func (m *delayedChatModel) Stream(
	_ context.Context,
	_ llm.ProviderConfig,
	_ []llm.ChatMessage,
	_ llm.RequestOptions,
	onDelta func(llm.StreamDelta),
) (llm.StreamResult, error) {
	if onDelta != nil {
		onDelta(llm.StreamDelta{Reasoning: "step 1"})
		time.Sleep(m.delay)
		onDelta(llm.StreamDelta{Content: "answer"})
	}

	return llm.StreamResult{
		Content:          "answer",
		ReasoningContent: "step 1",
		FinishReason:     "stop",
	}, nil
}

type pauseAfterDeltaModel struct {
	started chan struct{}
	release chan struct{}
}

func (m *pauseAfterDeltaModel) Stream(
	_ context.Context,
	_ llm.ProviderConfig,
	_ []llm.ChatMessage,
	_ llm.RequestOptions,
	onDelta func(llm.StreamDelta),
) (llm.StreamResult, error) {
	if onDelta != nil {
		onDelta(llm.StreamDelta{Content: "answer"})
	}
	select {
	case <-m.started:
	default:
		close(m.started)
	}
	<-m.release
	return llm.StreamResult{
		Content:      "answer",
		FinishReason: "stop",
	}, nil
}

func (f *fakeChatModel) Stream(
	_ context.Context,
	providerConfig llm.ProviderConfig,
	history []llm.ChatMessage,
	options llm.RequestOptions,
	onDelta func(llm.StreamDelta),
) (llm.StreamResult, error) {
	f.lastProvider = providerConfig
	f.lastOptions = options
	f.lastHistory = append([]llm.ChatMessage(nil), history...)
	f.callHistories = append(f.callHistories, append([]llm.ChatMessage(nil), history...))

	response := fakeStreamResponse{
		chunks:          f.chunks,
		reasoningChunks: f.reasoningChunks,
		finishReason:    f.finishReason,
		err:             f.err,
	}
	if f.callCount < len(f.responses) {
		response = f.responses[f.callCount]
	}
	f.callCount++

	full := ""
	reasoning := ""
	if len(response.deltas) > 0 {
		for _, delta := range response.deltas {
			full += delta.Content
			reasoning += delta.Reasoning
			if onDelta != nil {
				onDelta(delta)
			}
		}
	} else {
		for _, chunk := range response.reasoningChunks {
			reasoning += chunk
			if onDelta != nil {
				onDelta(llm.StreamDelta{Reasoning: chunk})
			}
		}
		for _, chunk := range response.chunks {
			full += chunk
			if onDelta != nil {
				onDelta(llm.StreamDelta{Content: chunk})
			}
		}
	}
	return llm.StreamResult{
		Content:          full,
		ReasoningContent: reasoning,
		FinishReason:     response.finishReason,
	}, response.err
}

type fakeProviderResolver struct {
	resolved              *provider.ResolvedProvider
	err                   error
	lastPreferredPresetID *uint
}

func (f *fakeProviderResolver) ResolveForUser(_ uint, preferredPresetID *uint) (*provider.ResolvedProvider, error) {
	f.lastPreferredPresetID = cloneUint(preferredPresetID)
	if f.err != nil {
		return nil, f.err
	}
	return f.resolved, nil
}

type fakeAttachmentStore struct {
	normalized []models.Attachment
	cleaned    []models.Attachment
}

func (f *fakeAttachmentStore) ValidateForUser(_ uint, attachments []models.Attachment) ([]models.Attachment, error) {
	if f.normalized != nil {
		return f.normalized, nil
	}
	return attachments, nil
}

func (f *fakeAttachmentStore) BuildModelAttachments(attachments []models.Attachment) ([]llm.Attachment, error) {
	result := make([]llm.Attachment, 0, len(attachments))
	for _, attachment := range attachments {
		kind := llm.AttachmentKindText
		if strings.HasPrefix(attachment.MIMEType, "image/") {
			kind = llm.AttachmentKindImage
		}
		result = append(result, llm.Attachment{
			Kind:     kind,
			Name:     attachment.Name,
			MIMEType: attachment.MIMEType,
			URL:      attachment.URL,
			Text:     attachment.Name,
		})
	}
	return result, nil
}

func (f *fakeAttachmentStore) CleanupUnreferenced(attachments []models.Attachment) error {
	f.cleaned = append(f.cleaned, attachments...)
	return nil
}

type fakeKnowledgeSearcher struct {
	result    *rag.SearchResult
	err       error
	lastInput rag.SearchInput
}

func (f *fakeKnowledgeSearcher) Search(_ context.Context, _ uint, input rag.SearchInput, _ rag.ProviderConfig) (*rag.SearchResult, error) {
	f.lastInput = input
	if f.err != nil {
		return nil, f.err
	}
	if f.result == nil {
		return &rag.SearchResult{}, nil
	}
	return f.result, nil
}

func TestStreamAssistantReplyMarksFailedMessages(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	service := NewService(db, &fakeChatModel{
		chunks: []string{"partial"},
		err:    errors.New("upstream failed"),
	}, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if len(messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(messages))
	}
	if messages[1].Status != models.MessageStatusFailed {
		t.Fatalf("expected assistant message to be failed, got %q", messages[1].Status)
	}
	if messages[1].Content != "partial" {
		t.Fatalf("expected partial content to be saved, got %q", messages[1].Content)
	}
}

func TestStreamAssistantReplyUsesKnowledgeContextWhenKnowledgeSpacesSelected(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	conversation.KnowledgeSpaceIDs = []uint{9}
	if err := db.Save(&conversation).Error; err != nil {
		t.Fatalf("save conversation defaults: %v", err)
	}

	model := &fakeChatModel{
		chunks: []string{"knowledge answer"},
	}
	searcher := &fakeKnowledgeSearcher{
		result: &rag.SearchResult{
			Citations: []models.AgentCitation{
				{DocumentID: 1, DocumentName: "Spec", ChunkID: 7, Snippet: "retrieved"},
			},
			ContextBlocks: []string{"Stored answer from docs"},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{}).WithKnowledgeSearcher(searcher)

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "what is stored",
	}, func(event StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	if searcher.lastInput.Query != "what is stored" {
		t.Fatalf("expected search query to use message content, got %#v", searcher.lastInput)
	}
	if len(searcher.lastInput.KnowledgeSpaceIDs) != 1 || searcher.lastInput.KnowledgeSpaceIDs[0] != 9 {
		t.Fatalf("expected conversation knowledge spaces to drive search, got %#v", searcher.lastInput.KnowledgeSpaceIDs)
	}
	if len(model.lastHistory) == 0 || model.lastHistory[0].Role != models.RoleSystem {
		t.Fatalf("expected system prompt with knowledge context, got %#v", model.lastHistory)
	}
	if !strings.Contains(model.lastHistory[0].Content, "Stored answer from docs") {
		t.Fatalf("expected retrieved context in system prompt, got %q", model.lastHistory[0].Content)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(messages))
	}
	if messages[1].Content != "knowledge answer" {
		t.Fatalf("expected knowledge answer to persist, got %q", messages[1].Content)
	}
	if len(messages[1].RunSummary.Citations) != 1 {
		t.Fatalf("expected run summary to persist, got %#v", messages[1].RunSummary)
	}
}

func TestStreamAssistantReplyUsesExplicitKnowledgeSpacesForSearch(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	conversation.KnowledgeSpaceIDs = []uint{9}
	if err := db.Save(&conversation).Error; err != nil {
		t.Fatalf("save conversation defaults: %v", err)
	}

	searcher := &fakeKnowledgeSearcher{
		result: &rag.SearchResult{
			ContextBlocks: []string{"override space"},
		},
	}
	service := NewService(db, &fakeChatModel{
		chunks: []string{"ok"},
	}, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{}).WithKnowledgeSearcher(searcher)

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content:           "what is stored",
		KnowledgeSpaceIDs: []uint{3, 5},
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	if len(searcher.lastInput.KnowledgeSpaceIDs) != 2 || searcher.lastInput.KnowledgeSpaceIDs[0] != 3 || searcher.lastInput.KnowledgeSpaceIDs[1] != 5 {
		t.Fatalf("expected explicit knowledge space override, got %#v", searcher.lastInput.KnowledgeSpaceIDs)
	}
}

func TestStreamAssistantReplyAutoContinuesAfterLengthFinishReason(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				chunks:       []string{"partial"},
				finishReason: "length",
			},
			{
				chunks:       []string{" reply"},
				finishReason: "stop",
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].Status != models.MessageStatusCompleted {
		t.Fatalf("expected assistant message to be completed, got %q", messages[1].Status)
	}
	if messages[1].Content != "partial reply" {
		t.Fatalf("expected continued content, got %q", messages[1].Content)
	}
	if model.callCount != 2 {
		t.Fatalf("expected two stream attempts, got %d", model.callCount)
	}
	secondHistory := model.callHistories[1]
	if len(secondHistory) < 3 {
		t.Fatalf("expected continuation history, got %#v", secondHistory)
	}
	if secondHistory[len(secondHistory)-2].Role != models.RoleAssistant ||
		secondHistory[len(secondHistory)-2].Content != "partial" {
		t.Fatalf("expected previous partial assistant message, got %#v", secondHistory[len(secondHistory)-2])
	}
	if secondHistory[len(secondHistory)-1].Role != models.RoleUser ||
		secondHistory[len(secondHistory)-1].Content != continueAssistantPrompt {
		t.Fatalf("expected continuation prompt, got %#v", secondHistory[len(secondHistory)-1])
	}
}

func TestStreamAssistantReplyAutoContinuesRecoverablePartialError(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				chunks: []string{"partial"},
				err:    errors.New("unexpected EOF"),
			},
			{
				chunks:       []string{" reply"},
				finishReason: "stop",
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].Status != models.MessageStatusCompleted {
		t.Fatalf("expected assistant message to be completed, got %q", messages[1].Status)
	}
	if messages[1].Content != "partial reply" {
		t.Fatalf("expected continued content, got %q", messages[1].Content)
	}
	if model.callCount != 2 {
		t.Fatalf("expected two stream attempts, got %d", model.callCount)
	}
}

func TestStreamAssistantReplyStreamsFinalContentOnly(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				deltas: []llm.StreamDelta{
					{Reasoning: "step 1"},
					{Reasoning: " -> step 2"},
					{Content: "final answer"},
				},
				finishReason: "stop",
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	var events []StreamEvent
	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(event StreamEvent) error {
		events = append(events, event)
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].Content != "final answer" {
		t.Fatalf("expected final content to persist, got %q", messages[1].Content)
	}
	if messages[1].ReasoningContent != "step 1 -> step 2" {
		t.Fatalf("expected reasoning content to persist, got %q", messages[1].ReasoningContent)
	}
	if !containsStreamEventType(events, "reasoning_start") {
		t.Fatalf("expected reasoning_start event, got %#v", events)
	}
	if countStreamEventType(events, "reasoning_delta") != 2 {
		t.Fatalf("expected 2 reasoning_delta events, got %#v", events)
	}
	if !containsStreamEventType(events, "reasoning_done") {
		t.Fatalf("expected reasoning_done event, got %#v", events)
	}
	doneEvent := findStreamEventByType(events, "done")
	if doneEvent == nil || doneEvent.Message == nil {
		t.Fatalf("expected done event with message, got %#v", events)
	}
	if doneEvent.Message.Content != "final answer" {
		t.Fatalf("expected done event message content, got %#v", doneEvent.Message)
	}
	if doneEvent.Message.ReasoningContent != "step 1 -> step 2" {
		t.Fatalf("expected done event message reasoning content, got %#v", doneEvent.Message)
	}
}

func TestStreamAssistantReplyKeepsReasoningContentWhenStreamingFails(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				deltas: []llm.StreamDelta{
					{Reasoning: "partial thinking"},
					{Content: "partial answer"},
				},
				err: errors.New("stream exploded"),
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	var events []StreamEvent
	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(event StreamEvent) error {
		events = append(events, event)
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].ReasoningContent != "partial thinking" {
		t.Fatalf("expected reasoning content to be preserved on failure, got %q", messages[1].ReasoningContent)
	}
	errorEvent := findStreamEventByType(events, "error")
	if errorEvent == nil || errorEvent.Message == nil {
		t.Fatalf("expected error event with message, got %#v", events)
	}
	if errorEvent.Message.Content != "partial answer" {
		t.Fatalf("expected error event message content, got %#v", errorEvent.Message)
	}
	if errorEvent.Message.ReasoningContent != "partial thinking" {
		t.Fatalf("expected error event message reasoning content, got %#v", errorEvent.Message)
	}
}

func TestStreamAssistantReplySplitsLeadingThinkBlocksFromContent(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				deltas: []llm.StreamDelta{
					{Content: "<thi"},
					{Content: "nk>step 1"},
					{Content: "</thin"},
					{Content: "k><think>step 2</think>Final"},
					{Content: " answer<think>kept</think>"},
				},
				finishReason: "stop",
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	var events []StreamEvent
	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(event StreamEvent) error {
		events = append(events, event)
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].ReasoningContent != "step 1step 2" {
		t.Fatalf("expected leading think blocks in reasoning content, got %q", messages[1].ReasoningContent)
	}
	if messages[1].Content != "Final answer<think>kept</think>" {
		t.Fatalf("expected non-leading think blocks to remain in content, got %q", messages[1].Content)
	}
	if countStreamEventType(events, "reasoning_delta") == 0 {
		t.Fatalf("expected reasoning delta events, got %#v", events)
	}
	doneEvent := findStreamEventByType(events, "done")
	if doneEvent == nil || doneEvent.Message == nil {
		t.Fatalf("expected done event with final message, got %#v", events)
	}
	if doneEvent.Message.ReasoningContent != "step 1step 2" {
		t.Fatalf("expected done event reasoning content, got %#v", doneEvent.Message)
	}
	if doneEvent.Message.Content != "Final answer<think>kept</think>" {
		t.Fatalf("expected done event content to exclude leading think blocks only, got %#v", doneEvent.Message)
	}
}

func TestStreamAssistantReplyContinuesAfterSubscriberDisconnect(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	service := NewService(db, &delayedChatModel{delay: 20 * time.Millisecond}, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	disconnectErr := errors.New("client disconnected")
	var emitted []StreamEvent
	var once sync.Once
	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(event StreamEvent) error {
		emitted = append(emitted, event)
		if event.Type == "delta" {
			var err error
			once.Do(func() {
				err = disconnectErr
			})
			return err
		}
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		var messages []models.Message
		if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
			t.Fatalf("query messages: %v", err)
		}
		if len(messages) == 2 && messages[1].Status == models.MessageStatusCompleted {
			if messages[1].Content != "answer" {
				t.Fatalf("expected completed answer to persist, got %q", messages[1].Content)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("expected assistant message to complete after disconnect, got %#v", emitted)
}

func TestStreamAssistantReplyPreservesWhitespaceBetweenLeadingThinkBlocks(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				deltas: []llm.StreamDelta{
					{Content: "<think>step 1</think>\n"},
					{Content: "<think>step 2</think>\nFinal answer"},
				},
				finishReason: "stop",
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	var events []StreamEvent
	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(event StreamEvent) error {
		events = append(events, event)
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].ReasoningContent != "step 1\nstep 2" {
		t.Fatalf("expected leading think block whitespace to be preserved, got %q", messages[1].ReasoningContent)
	}
	if messages[1].Content != "\nFinal answer" {
		t.Fatalf("expected remaining content to keep its leading newline, got %q", messages[1].Content)
	}
	doneEvent := findStreamEventByType(events, "done")
	if doneEvent == nil || doneEvent.Message == nil {
		t.Fatalf("expected done event with final message, got %#v", events)
	}
	if doneEvent.Message.ReasoningContent != "step 1\nstep 2" {
		t.Fatalf("expected done event reasoning to preserve think block whitespace, got %#v", doneEvent.Message)
	}
	if doneEvent.Message.Content != "\nFinal answer" {
		t.Fatalf("expected done event content to preserve visible leading newline, got %#v", doneEvent.Message)
	}
}

func TestStreamAssistantReplyCancelsAfterDetachTimeout(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &blockingChatModel{
		started: make(chan struct{}),
		done:    make(chan struct{}),
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})
	service.detachTimeout = 20 * time.Millisecond

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return errors.New("client disconnected")
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	select {
	case <-model.started:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected model stream to start")
	}

	select {
	case <-model.done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected model stream to be cancelled after detach timeout")
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if !service.waitForActiveRunCompletion(waitCtx, conversation.ID) {
		t.Fatal("expected detached run to finish cleanup")
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if len(messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(messages))
	}
	if messages[1].Status != models.MessageStatusCancelled {
		t.Fatalf("expected detached stream to become cancelled, got %q", messages[1].Status)
	}
	if messages[1].ReasoningContent != "thinking" {
		t.Fatalf("expected cancelled stream to preserve reasoning content, got %q", messages[1].ReasoningContent)
	}
}

func TestResumeActiveStreamReplaysEventsAfterSequence(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &pauseAfterDeltaModel{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	lastSeenSeq := 0
	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(event StreamEvent) error {
		if event.Type == "delta" {
			lastSeenSeq = event.Seq
			return errors.New("client disconnected")
		}
		lastSeenSeq = event.Seq
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}
	<-model.started

	var resumed []StreamEvent
	go func() {
		close(model.release)
	}()
	if err := service.ResumeActiveStream(context.Background(), user.ID, conversation.ID, lastSeenSeq, func(event StreamEvent) error {
		resumed = append(resumed, event)
		return nil
	}); err != nil {
		t.Fatalf("ResumeActiveStream() error = %v", err)
	}

	if len(resumed) == 0 {
		t.Fatalf("expected replayed events, got %#v", resumed)
	}
	if resumed[len(resumed)-1].Type != "done" {
		t.Fatalf("expected final resumed event to be done, got %#v", resumed)
	}
	if resumed[0].Seq <= lastSeenSeq {
		t.Fatalf("expected resumed events after seq %d, got %#v", lastSeenSeq, resumed)
	}
}

func TestStreamAssistantReplyDisconnectDoesNotFailMessageAfterStreamStart(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				deltas: []llm.StreamDelta{
					{Content: "partial answer"},
				},
				finishReason: "stop",
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	expectedErr := errors.New("stream writer failed")
	err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(event StreamEvent) error {
		if event.Type == "delta" {
			return expectedErr
		}
		return nil
	})
	if err != nil {
		t.Fatalf("expected disconnect to stop only the subscriber, got %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].Status != models.MessageStatusCompleted {
		t.Fatalf("expected assistant message to complete after disconnect, got %q", messages[1].Status)
	}
	if messages[1].Content != "partial answer" {
		t.Fatalf("expected partial content to be preserved, got %q", messages[1].Content)
	}
}

func containsStreamEventType(events []StreamEvent, eventType string) bool {
	return findStreamEventByType(events, eventType) != nil
}

func countStreamEventType(events []StreamEvent, eventType string) int {
	count := 0
	for _, event := range events {
		if event.Type == eventType {
			count++
		}
	}
	return count
}

func findStreamEventByType(events []StreamEvent, eventType string) *StreamEvent {
	for index := range events {
		if events[index].Type == eventType {
			return &events[index]
		}
	}
	return nil
}

func TestStreamAssistantReplyKeepsAccumulatedContentWhenContinuationFails(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		responses: []fakeStreamResponse{
			{
				chunks:       []string{"partial"},
				finishReason: "length",
			},
			{
				chunks: []string{" reply"},
				err:    errors.New("stream exploded"),
			},
		},
	}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "test-key",
				DefaultModel: "provider-model",
			},
		},
	}, &fakeAttachmentStore{})

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).Order("id asc").Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if messages[1].Status != models.MessageStatusFailed {
		t.Fatalf("expected assistant message to be failed, got %q", messages[1].Status)
	}
	if messages[1].Content != "partial reply" {
		t.Fatalf("expected accumulated content to be preserved, got %q", messages[1].Content)
	}
}

func TestStreamAssistantReplyReturnsNoProviderError(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{
		err: provider.ErrNoProviderConfigured,
	}, &fakeAttachmentStore{})

	err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	})
	if err == nil {
		t.Fatal("expected provider configuration error, got nil")
	}
	if !errors.Is(err, provider.ErrNoProviderConfigured) {
		t.Fatalf("expected ErrNoProviderConfigured, got %v", err)
	}
}

func TestResolveSettingsUsesUserDefaultsAndConversationPromptPriority(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	temperature := float32(0.7)
	maxTokens := 2048
	contextWindowTurns := 6
	if err := db.Model(&models.User{}).
		Where("id = ?", user.ID).
		Updates(map[string]any{
			"default_model":                "user-model",
			"default_temperature":          &temperature,
			"default_max_tokens":           &maxTokens,
			"default_context_window_turns": &contextWindowTurns,
		}).Error; err != nil {
		t.Fatalf("update user defaults: %v", err)
	}

	baseConversation := &models.Conversation{
		SystemPrompt: "",
	}

	settings, err := service.resolveSettings(user.ID, baseConversation, nil, "provider-model")
	if err != nil {
		t.Fatalf("resolveSettings() error = %v", err)
	}
	if settings.Model != "user-model" {
		t.Fatalf("expected user default model, got %q", settings.Model)
	}
	if settings.Temperature == nil || *settings.Temperature != temperature {
		t.Fatalf("expected user default temperature, got %#v", settings.Temperature)
	}
	if settings.MaxTokens == nil || *settings.MaxTokens != maxTokens {
		t.Fatalf("expected user default max tokens, got %#v", settings.MaxTokens)
	}
	if settings.ContextWindowTurns == nil || *settings.ContextWindowTurns != contextWindowTurns {
		t.Fatalf("expected user default context window, got %#v", settings.ContextWindowTurns)
	}

	settings, err = service.resolveSettings(user.ID, &models.Conversation{
		SystemPrompt:       "Conversation prompt",
		Model:              "conversation-model",
		Temperature:        ptrFloat32(0.4),
		MaxTokens:          ptrInt(768),
		ContextWindowTurns: ptrInt(2),
	}, &ConversationSettings{
		SystemPrompt:       "Override prompt",
		Model:              "override-model",
		Temperature:        ptrFloat32(0.5),
		MaxTokens:          ptrInt(1536),
		ContextWindowTurns: ptrInt(8),
	}, "provider-model")
	if err != nil {
		t.Fatalf("resolveSettings() error = %v", err)
	}
	if settings.SystemPrompt != "Override prompt" {
		t.Fatalf("expected override prompt to win, got %q", settings.SystemPrompt)
	}
	if settings.Model != "override-model" {
		t.Fatalf("expected override model to win, got %q", settings.Model)
	}
	if settings.Temperature == nil || *settings.Temperature != 0.5 {
		t.Fatalf("expected override temperature, got %#v", settings.Temperature)
	}
	if settings.MaxTokens == nil || *settings.MaxTokens != 1536 {
		t.Fatalf("expected override max tokens, got %#v", settings.MaxTokens)
	}
	if settings.ContextWindowTurns == nil || *settings.ContextWindowTurns != 8 {
		t.Fatalf("expected override context window, got %#v", settings.ContextWindowTurns)
	}
}

func TestUpdateConversationPersistsConversationLevelSettings(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	temperature := float32(0.2)
	maxTokens := 512
	contextWindowTurns := 3
	providerPresetID := uint(21)
	providerPreset := models.LLMProviderPreset{
		ID:              providerPresetID,
		UserID:          user.ID,
		Name:            "OpenAI",
		BaseURL:         "https://api.openai.com/v1",
		EncryptedAPIKey: "encrypted",
		APIKeyHint:      "sk-***",
		Models:          []string{"custom-model"},
		DefaultModel:    "custom-model",
	}
	if err := db.Create(&providerPreset).Error; err != nil {
		t.Fatalf("create provider preset: %v", err)
	}
	updatedConversation, err := service.UpdateConversation(user.ID, conversation.ID, ConversationUpdateInput{
		Settings: &ConversationSettings{
			ProviderPresetID:   &providerPresetID,
			SystemPrompt:       "Conversation prompt",
			Model:              "custom-model",
			Temperature:        &temperature,
			MaxTokens:          &maxTokens,
			ContextWindowTurns: &contextWindowTurns,
		},
	})
	if err != nil {
		t.Fatalf("UpdateConversation() error = %v", err)
	}

	if updatedConversation.SystemPrompt != "Conversation prompt" {
		t.Fatalf("expected system prompt to update, got %q", updatedConversation.SystemPrompt)
	}
	if updatedConversation.ProviderPresetID == nil || *updatedConversation.ProviderPresetID != providerPresetID {
		t.Fatalf("expected provider preset id to update, got %#v", updatedConversation.ProviderPresetID)
	}
	if updatedConversation.Model != "custom-model" {
		t.Fatalf("expected model to update, got %q", updatedConversation.Model)
	}
	if updatedConversation.Temperature == nil || *updatedConversation.Temperature != temperature {
		t.Fatalf("expected temperature to update, got %#v", updatedConversation.Temperature)
	}
	if updatedConversation.MaxTokens == nil || *updatedConversation.MaxTokens != maxTokens {
		t.Fatalf("expected max tokens to update, got %#v", updatedConversation.MaxTokens)
	}
	if updatedConversation.ContextWindowTurns == nil || *updatedConversation.ContextWindowTurns != contextWindowTurns {
		t.Fatalf("expected context window to update, got %#v", updatedConversation.ContextWindowTurns)
	}

	var stored models.Conversation
	if err := db.First(&stored, conversation.ID).Error; err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if stored.ProviderPresetID == nil || *stored.ProviderPresetID != providerPresetID {
		t.Fatalf("expected provider preset id to persist, got %#v", stored.ProviderPresetID)
	}
	if stored.Model != "custom-model" {
		t.Fatalf("expected model to persist, got %q", stored.Model)
	}
	if stored.Temperature == nil || *stored.Temperature != temperature {
		t.Fatalf("expected temperature to persist, got %#v", stored.Temperature)
	}
	if stored.MaxTokens == nil || *stored.MaxTokens != maxTokens {
		t.Fatalf("expected max tokens to persist, got %#v", stored.MaxTokens)
	}
	if stored.ContextWindowTurns == nil || *stored.ContextWindowTurns != contextWindowTurns {
		t.Fatalf("expected context window to persist, got %#v", stored.ContextWindowTurns)
	}
}

func TestUpdateConversationPersistsZeroConversationLevelSettings(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	maxTokens := 0
	contextWindowTurns := 0
	updatedConversation, err := service.UpdateConversation(user.ID, conversation.ID, ConversationUpdateInput{
		Settings: &ConversationSettings{
			MaxTokens:          &maxTokens,
			ContextWindowTurns: &contextWindowTurns,
		},
	})
	if err != nil {
		t.Fatalf("UpdateConversation() error = %v", err)
	}

	if updatedConversation.MaxTokens == nil || *updatedConversation.MaxTokens != 0 {
		t.Fatalf("expected zero max tokens to update, got %#v", updatedConversation.MaxTokens)
	}
	if updatedConversation.ContextWindowTurns == nil || *updatedConversation.ContextWindowTurns != 0 {
		t.Fatalf("expected zero context window turns to update, got %#v", updatedConversation.ContextWindowTurns)
	}

	var stored models.Conversation
	if err := db.First(&stored, conversation.ID).Error; err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if stored.MaxTokens == nil || *stored.MaxTokens != 0 {
		t.Fatalf("expected zero max tokens to persist, got %#v", stored.MaxTokens)
	}
	if stored.ContextWindowTurns == nil || *stored.ContextWindowTurns != 0 {
		t.Fatalf("expected zero context window turns to persist, got %#v", stored.ContextWindowTurns)
	}
}

func TestUpdateConversationPersistsFolderAndTags(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	updatedConversation, err := service.UpdateConversation(user.ID, conversation.ID, ConversationUpdateInput{
		Folder: ptrString("Work"),
		Tags:   &[]string{"urgent", "backend"},
	})
	if err != nil {
		t.Fatalf("UpdateConversation() error = %v", err)
	}

	if updatedConversation.Folder != "Work" {
		t.Fatalf("expected folder to update, got %q", updatedConversation.Folder)
	}
	if len(updatedConversation.Tags) != 2 || updatedConversation.Tags[0] != "urgent" || updatedConversation.Tags[1] != "backend" {
		t.Fatalf("expected tags to update, got %#v", updatedConversation.Tags)
	}
}

func TestUpdateConversationPersistsKnowledgeSpaces(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	knowledgeSpaces := []models.KnowledgeSpace{
		{UserID: user.ID, Name: "Docs"},
		{UserID: user.ID, Name: "Runbooks"},
	}
	if err := db.Create(&knowledgeSpaces).Error; err != nil {
		t.Fatalf("create knowledge spaces: %v", err)
	}

	updatedConversation, err := service.UpdateConversation(user.ID, conversation.ID, ConversationUpdateInput{
		KnowledgeSpaceIDs: &[]uint{knowledgeSpaces[0].ID, knowledgeSpaces[1].ID},
	})
	if err != nil {
		t.Fatalf("UpdateConversation() error = %v", err)
	}

	if len(updatedConversation.KnowledgeSpaceIDs) != 2 ||
		updatedConversation.KnowledgeSpaceIDs[0] != knowledgeSpaces[0].ID ||
		updatedConversation.KnowledgeSpaceIDs[1] != knowledgeSpaces[1].ID {
		t.Fatalf("expected knowledge space ids to update, got %#v", updatedConversation.KnowledgeSpaceIDs)
	}
}

func TestCreateConversationRejectsKnowledgeSpaceFromAnotherUser(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	foreignSpace := models.KnowledgeSpace{
		UserID: user.ID + 1,
		Name:   "Foreign docs",
	}
	if err := db.Create(&foreignSpace).Error; err != nil {
		t.Fatalf("create foreign knowledge space: %v", err)
	}

	_, err := service.CreateConversation(user.ID, CreateConversationInput{
		KnowledgeSpaceIDs: &[]uint{foreignSpace.ID},
	})
	if err == nil {
		t.Fatal("expected knowledge space ownership validation error")
	}
	if !isRequestError(err) || err.Error() != "knowledge space not found" {
		t.Fatalf("expected knowledge space not found request error, got %v", err)
	}

	var count int64
	if err := db.Model(&models.Conversation{}).Where("user_id = ?", user.ID).Count(&count).Error; err != nil {
		t.Fatalf("count conversations: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected no extra conversation to be created, got %d", count)
	}
}

func TestUpdateConversationRejectsKnowledgeSpaceFromAnotherUser(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	foreignSpace := models.KnowledgeSpace{
		UserID: user.ID + 1,
		Name:   "Foreign docs",
	}
	if err := db.Create(&foreignSpace).Error; err != nil {
		t.Fatalf("create foreign knowledge space: %v", err)
	}

	_, err := service.UpdateConversation(user.ID, conversation.ID, ConversationUpdateInput{
		KnowledgeSpaceIDs: &[]uint{foreignSpace.ID},
	})
	if err == nil {
		t.Fatal("expected knowledge space ownership validation error")
	}
	if !isRequestError(err) || err.Error() != "knowledge space not found" {
		t.Fatalf("expected knowledge space not found request error, got %v", err)
	}

	reloadedConversation, err := service.GetConversation(user.ID, conversation.ID)
	if err != nil {
		t.Fatalf("GetConversation() error = %v", err)
	}
	if len(reloadedConversation.KnowledgeSpaceIDs) != 0 {
		t.Fatalf("expected knowledge spaces to remain unchanged, got %#v", reloadedConversation.KnowledgeSpaceIDs)
	}
}

func TestCreateConversationGeneratesConversationPublicID(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	createdConversation, err := service.CreateConversation(user.ID, CreateConversationInput{})
	if err != nil {
		t.Fatalf("CreateConversation() error = %v", err)
	}

	var publicID string
	if err := db.Raw("SELECT public_id FROM conversations WHERE id = ?", createdConversation.ID).Scan(&publicID).Error; err != nil {
		t.Fatalf("load conversation public id: %v", err)
	}
	if publicID == "" {
		t.Fatal("expected conversation public id to be persisted")
	}
	if _, err := uuid.Parse(publicID); err != nil {
		t.Fatalf("expected valid UUID public id, got %q: %v", publicID, err)
	}
}

func TestImportConversationGeneratesConversationPublicID(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	importedConversation, err := service.ImportConversation(user.ID, ImportConversationInput{
		Title: "Imported chat",
		Messages: []ImportMessageInput{
			{Role: models.RoleUser, Content: "Hello"},
			{Role: models.RoleAssistant, Content: "Hi"},
		},
	})
	if err != nil {
		t.Fatalf("ImportConversation() error = %v", err)
	}

	var publicID string
	if err := db.Raw("SELECT public_id FROM conversations WHERE id = ?", importedConversation.ID).Scan(&publicID).Error; err != nil {
		t.Fatalf("load imported conversation public id: %v", err)
	}
	if publicID == "" {
		t.Fatal("expected imported conversation public id to be persisted")
	}
	if _, err := uuid.Parse(publicID); err != nil {
		t.Fatalf("expected valid UUID public id, got %q: %v", publicID, err)
	}
}

func TestImportConversationRejectsKnowledgeSpaceFromAnotherUser(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	foreignSpace := models.KnowledgeSpace{
		UserID: user.ID + 1,
		Name:   "Foreign docs",
	}
	if err := db.Create(&foreignSpace).Error; err != nil {
		t.Fatalf("create foreign knowledge space: %v", err)
	}

	_, err := service.ImportConversation(user.ID, ImportConversationInput{
		Title:             "Imported chat",
		KnowledgeSpaceIDs: &[]uint{foreignSpace.ID},
		Messages: []ImportMessageInput{
			{Role: models.RoleUser, Content: "Hello"},
			{Role: models.RoleAssistant, Content: "Hi"},
		},
	})
	if err == nil {
		t.Fatal("expected knowledge space ownership validation error")
	}
	if !isRequestError(err) || err.Error() != "knowledge space not found" {
		t.Fatalf("expected knowledge space not found request error, got %v", err)
	}

	var count int64
	if err := db.Model(&models.Conversation{}).Where("user_id = ?", user.ID).Count(&count).Error; err != nil {
		t.Fatalf("count conversations: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected no extra conversation to be created, got %d", count)
	}
}

func TestCreateConversationPersistsInitialMetadataAndSettings(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	temperature := float32(0.6)
	maxTokens := 1536
	contextWindowTurns := 8
	providerPresetID := uint(27)
	providerPreset := models.LLMProviderPreset{
		ID:              providerPresetID,
		UserID:          user.ID,
		Name:            "OpenAI",
		BaseURL:         "https://api.openai.com/v1",
		EncryptedAPIKey: "encrypted",
		APIKeyHint:      "sk-***",
		Models:          []string{"gpt-4.1-mini"},
		DefaultModel:    "gpt-4.1-mini",
	}
	if err := db.Create(&providerPreset).Error; err != nil {
		t.Fatalf("create provider preset: %v", err)
	}
	knowledgeSpaces := []models.KnowledgeSpace{
		{UserID: user.ID, Name: "Docs"},
		{UserID: user.ID, Name: "Runbooks"},
	}
	if err := db.Create(&knowledgeSpaces).Error; err != nil {
		t.Fatalf("create knowledge spaces: %v", err)
	}

	createdConversation, err := service.CreateConversation(user.ID, CreateConversationInput{
		Folder:            ptrString("  Work  "),
		Tags:              &[]string{" urgent ", "backend", "URGENT"},
		KnowledgeSpaceIDs: &[]uint{knowledgeSpaces[0].ID, knowledgeSpaces[1].ID},
		Settings: &ConversationSettings{
			ProviderPresetID:   &providerPresetID,
			SystemPrompt:       "  Draft prompt  ",
			Model:              "  gpt-4.1-mini  ",
			Temperature:        &temperature,
			MaxTokens:          &maxTokens,
			ContextWindowTurns: &contextWindowTurns,
		},
	})
	if err != nil {
		t.Fatalf("CreateConversation() error = %v", err)
	}

	if createdConversation.Title != defaultConversationTitle {
		t.Fatalf("expected default title, got %q", createdConversation.Title)
	}
	if createdConversation.Folder != "Work" {
		t.Fatalf("expected folder to be sanitized, got %q", createdConversation.Folder)
	}
	if len(createdConversation.Tags) != 3 || createdConversation.Tags[0] != "urgent" || createdConversation.Tags[1] != "backend" || createdConversation.Tags[2] != "URGENT" {
		t.Fatalf("expected tags to be sanitized, got %#v", createdConversation.Tags)
	}
	if createdConversation.ProviderPresetID == nil || *createdConversation.ProviderPresetID != providerPresetID {
		t.Fatalf("expected provider preset id to persist, got %#v", createdConversation.ProviderPresetID)
	}
	if len(createdConversation.KnowledgeSpaceIDs) != 2 ||
		createdConversation.KnowledgeSpaceIDs[0] != knowledgeSpaces[0].ID ||
		createdConversation.KnowledgeSpaceIDs[1] != knowledgeSpaces[1].ID {
		t.Fatalf("expected knowledge space ids to persist, got %#v", createdConversation.KnowledgeSpaceIDs)
	}
	if createdConversation.SystemPrompt != "Draft prompt" {
		t.Fatalf("expected system prompt to be sanitized, got %q", createdConversation.SystemPrompt)
	}
	if createdConversation.Model != "gpt-4.1-mini" {
		t.Fatalf("expected model to be sanitized, got %q", createdConversation.Model)
	}
	if createdConversation.Temperature == nil || *createdConversation.Temperature != temperature {
		t.Fatalf("expected temperature to persist, got %#v", createdConversation.Temperature)
	}
	if createdConversation.MaxTokens == nil || *createdConversation.MaxTokens != maxTokens {
		t.Fatalf("expected max tokens to persist, got %#v", createdConversation.MaxTokens)
	}
	if createdConversation.ContextWindowTurns == nil || *createdConversation.ContextWindowTurns != contextWindowTurns {
		t.Fatalf("expected context window turns to persist, got %#v", createdConversation.ContextWindowTurns)
	}
}

func TestListMessagesPageReturnsCursorForOlderMessages(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	for index := 0; index < 5; index += 1 {
		role := models.RoleUser
		if index%2 == 1 {
			role = models.RoleAssistant
		}
		message := &models.Message{
			ConversationID: conversation.ID,
			Role:           role,
			Content:        fmt.Sprintf("message-%d", index+1),
			Status:         models.MessageStatusCompleted,
		}
		mustCreateMessageRecord(t, db, message)
	}

	result, err := service.ListMessagesPage(user.ID, conversation.ID, ListMessagesParams{
		Limit: 2,
	})
	if err != nil {
		t.Fatalf("ListMessagesPage() error = %v", err)
	}

	if len(result.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(result.Messages))
	}
	if result.Messages[0].Content != "message-4" || result.Messages[1].Content != "message-5" {
		t.Fatalf("expected latest message window in ascending order, got %#v", result.Messages)
	}
	if !result.HasMore {
		t.Fatal("expected older messages to remain")
	}
	if result.NextBeforeID == nil || *result.NextBeforeID == 0 {
		t.Fatalf("expected cursor for older messages, got %#v", result.NextBeforeID)
	}

	older, err := service.ListMessagesPage(user.ID, conversation.ID, ListMessagesParams{
		Limit:    2,
		BeforeID: result.NextBeforeID,
	})
	if err != nil {
		t.Fatalf("ListMessagesPage(older) error = %v", err)
	}
	if len(older.Messages) != 2 {
		t.Fatalf("expected 2 older messages, got %d", len(older.Messages))
	}
	if older.Messages[0].Content != "message-2" || older.Messages[1].Content != "message-3" {
		t.Fatalf("expected older window in ascending order, got %#v", older.Messages)
	}
}

func TestListConversationsSearchMatchesFolderTagsMessageAndAttachmentText(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	attachment := models.Attachment{
		ID:       "attachment-1",
		Name:     "roadmap.txt",
		MIMEType: "text/plain",
		URL:      "/api/attachments/attachment-1/file",
		Size:     128,
	}
	createStoredAttachment(t, db, user.ID, attachment)
	if err := db.Model(&models.StoredAttachment{}).
		Where("id = ?", attachment.ID).
		Update("extracted_text", "searchable roadmap details").Error; err != nil {
		t.Fatalf("update extracted text: %v", err)
	}

	message := &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Discuss quarterly plan",
		Attachments:    []models.Attachment{attachment},
		Status:         models.MessageStatusCompleted,
	}
	mustCreateMessageRecord(t, db, message)

	if _, err := service.UpdateConversation(user.ID, conversation.ID, ConversationUpdateInput{
		Folder: ptrString("Work"),
		Tags:   &[]string{"urgent", "planning"},
	}); err != nil {
		t.Fatalf("UpdateConversation() error = %v", err)
	}

	testCases := []struct {
		name   string
		search string
	}{
		{name: "folder", search: "Work"},
		{name: "tag", search: "planning"},
		{name: "message", search: "quarterly"},
		{name: "attachment text", search: "roadmap details"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := service.ListConversations(user.ID, ListConversationsParams{
				Search: testCase.search,
			})
			if err != nil {
				t.Fatalf("ListConversations() error = %v", err)
			}
			if len(result.Conversations) != 1 || result.Conversations[0].ID != conversation.ID {
				t.Fatalf("expected search %q to match conversation, got %#v", testCase.search, result.Conversations)
			}
		})
	}
}

func TestResolveSystemPromptUsesSessionAndGlobalPriority(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	testCases := []struct {
		name          string
		sessionPrompt string
		globalPrompt  string
		wantPrompt    string
	}{
		{
			name:          "both empty",
			sessionPrompt: "",
			globalPrompt:  "",
			wantPrompt:    "",
		},
		{
			name:          "uses global when session empty",
			sessionPrompt: "",
			globalPrompt:  "Use global prompt",
			wantPrompt:    "Use global prompt",
		},
		{
			name:          "session overrides global",
			sessionPrompt: "Use session prompt",
			globalPrompt:  "Use global prompt",
			wantPrompt:    "Use session prompt",
		},
		{
			name:          "session whitespace falls back to global",
			sessionPrompt: "   ",
			globalPrompt:  "Use global prompt",
			wantPrompt:    "Use global prompt",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if err := db.Model(&models.User{}).
				Where("id = ?", user.ID).
				Update("global_prompt", testCase.globalPrompt).Error; err != nil {
				t.Fatalf("update global prompt: %v", err)
			}

			prompt, err := service.resolveSystemPrompt(user.ID, testCase.sessionPrompt)
			if err != nil {
				t.Fatalf("resolveSystemPrompt() error = %v", err)
			}
			if prompt != testCase.wantPrompt {
				t.Fatalf("expected %q, got %q", testCase.wantPrompt, prompt)
			}
		})
	}
}

func TestStreamAssistantReplyUsesResolvedProviderDefaults(t *testing.T) {
	db, user, conversation := newChatTestContext(t)

	model := &fakeChatModel{
		chunks: []string{"hello"},
	}

	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://preset.example.com/v1",
				APIKey:       "preset-key",
				DefaultModel: "preset-model",
			},
		},
	}, &fakeAttachmentStore{})

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	if model.lastProvider.BaseURL != "https://preset.example.com/v1" {
		t.Fatalf("expected resolved base URL, got %q", model.lastProvider.BaseURL)
	}
	if model.lastOptions.Model != "preset-model" {
		t.Fatalf("expected provider default model to be used, got %q", model.lastOptions.Model)
	}
}

func TestStreamAssistantReplyUsesGlobalPromptWhenConversationPromptIsEmpty(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	model := &fakeChatModel{
		chunks: []string{"hello"},
	}

	if err := db.Model(&models.User{}).
		Where("id = ?", user.ID).
		Update("global_prompt", "Use global prompt").Error; err != nil {
		t.Fatalf("update global prompt: %v", err)
	}

	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://preset.example.com/v1",
				APIKey:       "preset-key",
				DefaultModel: "preset-model",
			},
		},
	}, &fakeAttachmentStore{})

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	if len(model.lastHistory) == 0 {
		t.Fatal("expected history to include a system message")
	}
	if model.lastHistory[0].Role != models.RoleSystem {
		t.Fatalf("expected first history message to be system, got %q", model.lastHistory[0].Role)
	}
	if model.lastHistory[0].Content != "Use global prompt" {
		t.Fatalf("expected global prompt, got %q", model.lastHistory[0].Content)
	}
}

func TestStreamAssistantReplyOmitsSystemMessageWhenPromptsAreEmpty(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	model := &fakeChatModel{
		chunks: []string{"hello"},
	}

	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://preset.example.com/v1",
				APIKey:       "preset-key",
				DefaultModel: "preset-model",
			},
		},
	}, &fakeAttachmentStore{})

	if err := service.StreamAssistantReply(context.Background(), user.ID, conversation.ID, SendMessageInput{
		Content: "hello",
	}, func(StreamEvent) error {
		return nil
	}); err != nil {
		t.Fatalf("StreamAssistantReply() error = %v", err)
	}

	if len(model.lastHistory) == 0 {
		t.Fatal("expected user message history to be present")
	}
	if model.lastHistory[0].Role == models.RoleSystem {
		t.Fatalf("expected no system message when prompts are empty, got %#v", model.lastHistory[0])
	}
}

func TestHistoryForModelTrimsRecentTurns(t *testing.T) {
	db, _, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Question one",
		Status:         models.MessageStatusCompleted,
	})
	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "Answer one",
		Status:         models.MessageStatusCompleted,
	})
	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Question two",
		Status:         models.MessageStatusCompleted,
	})
	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "Answer two",
		Status:         models.MessageStatusCompleted,
	})
	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Question three",
		Status:         models.MessageStatusCompleted,
	})
	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "Answer three",
		Status:         models.MessageStatusCompleted,
	})

	history, err := service.historyForModel(
		conversation.ID,
		0,
		"Use global prompt",
		ptrInt(2),
	)
	if err != nil {
		t.Fatalf("historyForModel() error = %v", err)
	}

	if len(history) != 5 {
		t.Fatalf("expected 5 history messages, got %d", len(history))
	}
	if history[0].Role != models.RoleSystem || history[0].Content != "Use global prompt" {
		t.Fatalf("expected system prompt to be preserved, got %#v", history[0])
	}
	if history[1].Content != "Question two" || history[4].Content != "Answer three" {
		t.Fatalf("expected recent turns to remain, got %#v", history)
	}
}

func TestImportConversationCreatesConversationAndMessages(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	importedConversation, err := service.ImportConversation(user.ID, ImportConversationInput{
		Title: "Imported notes",
		Settings: &ConversationSettings{
			Model: "gpt-4.1-mini",
		},
		Messages: []ImportMessageInput{
			{
				Role:    models.RoleUser,
				Content: "Hello from markdown",
			},
			{
				Role:    models.RoleAssistant,
				Content: "Imported reply",
			},
		},
	})
	if err != nil {
		t.Fatalf("ImportConversation() error = %v", err)
	}

	if importedConversation.Title != "Imported notes" {
		t.Fatalf("expected imported title, got %q", importedConversation.Title)
	}
	if importedConversation.Model != "gpt-4.1-mini" {
		t.Fatalf("expected imported model, got %q", importedConversation.Model)
	}
	messages, err := service.ListMessages(user.ID, importedConversation.ID)
	if err != nil {
		t.Fatalf("ListMessages() error = %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 imported messages, got %d", len(messages))
	}
	if messages[0].Role != models.RoleUser || messages[0].Content != "Hello from markdown" {
		t.Fatalf("expected first imported user message, got %#v", messages[0])
	}
	if messages[1].Role != models.RoleAssistant || messages[1].Content != "Imported reply" {
		t.Fatalf("expected second imported assistant message, got %#v", messages[1])
	}
	if messages[0].Status != models.MessageStatusCompleted || messages[1].Status != models.MessageStatusCompleted {
		t.Fatalf("expected completed imported messages, got %q and %q", messages[0].Status, messages[1].Status)
	}
}

func TestImportConversationValidatesInput(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	testCases := []struct {
		name    string
		input   ImportConversationInput
		wantErr string
	}{
		{
			name: "empty title",
			input: ImportConversationInput{
				Title: "",
				Messages: []ImportMessageInput{
					{
						Role:    models.RoleUser,
						Content: "hello",
					},
				},
			},
			wantErr: "conversation title is required",
		},
		{
			name: "empty messages",
			input: ImportConversationInput{
				Title:    "Imported",
				Messages: nil,
			},
			wantErr: "at least one message is required",
		},
		{
			name: "invalid role",
			input: ImportConversationInput{
				Title: "Imported",
				Messages: []ImportMessageInput{
					{
						Role:    models.RoleSystem,
						Content: "nope",
					},
				},
			},
			wantErr: "message role must be user or assistant",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := service.ImportConversation(user.ID, testCase.input)
			if err == nil {
				t.Fatal("expected validation error, got nil")
			}
			if err.Error() != testCase.wantErr {
				t.Fatalf("expected %q, got %q", testCase.wantErr, err.Error())
			}
		})
	}
}

func TestRegenerateAssistantMessageReplaysHistoricalAssistant(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	model := &fakeChatModel{
		chunks: []string{"rewritten answer"},
	}
	uploads := &fakeAttachmentStore{}
	service := NewService(db, model, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://preset.example.com/v1",
				APIKey:       "preset-key",
				DefaultModel: "preset-model",
			},
		},
	}, uploads)

	userOne := models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Question one",
		Status:         models.MessageStatusCompleted,
	}
	assistantOne := models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "Answer one",
		Status:         models.MessageStatusCompleted,
	}
	trailingAttachment := models.Attachment{
		ID:       "attachment-history-1",
		Name:     "notes.txt",
		MIMEType: "text/plain",
		URL:      "/api/attachments/attachment-history-1/file",
		Size:     128,
	}
	createStoredAttachment(t, db, user.ID, trailingAttachment)
	userTwo := models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Question two",
		Attachments:    []models.Attachment{trailingAttachment},
		Status:         models.MessageStatusCompleted,
	}
	assistantTwo := models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "Answer two",
		Status:         models.MessageStatusCompleted,
	}

	mustCreateMessageRecord(t, db, &userOne)
	mustCreateMessageRecord(t, db, &assistantOne)
	mustCreateMessageRecord(t, db, &userTwo)
	mustCreateMessageRecord(t, db, &assistantTwo)

	if err := service.RegenerateAssistantMessage(
		context.Background(),
		user.ID,
		conversation.ID,
		assistantOne.ID,
		nil,
		func(StreamEvent) error {
			return nil
		},
	); err != nil {
		t.Fatalf("RegenerateAssistantMessage() error = %v", err)
	}

	var messages []models.Message
	if err := db.Where("conversation_id = ?", conversation.ID).
		Order("id asc").
		Find(&messages).Error; err != nil {
		t.Fatalf("query messages: %v", err)
	}

	if len(messages) != 2 {
		t.Fatalf("expected 2 messages after replay, got %d", len(messages))
	}
	if messages[0].ID != userOne.ID || messages[0].Content != "Question one" {
		t.Fatalf("expected first user message to remain, got %#v", messages[0])
	}
	if messages[1].ID != assistantOne.ID {
		t.Fatalf("expected replay to reuse assistant message id %d, got %d", assistantOne.ID, messages[1].ID)
	}
	if messages[1].Status != models.MessageStatusCompleted {
		t.Fatalf("expected replayed assistant to be completed, got %q", messages[1].Status)
	}
	if messages[1].Content != "rewritten answer" {
		t.Fatalf("expected replayed assistant content, got %q", messages[1].Content)
	}
	if len(model.lastHistory) != 1 || model.lastHistory[0].Content != "Question one" {
		t.Fatalf("expected history to stop before replay target, got %#v", model.lastHistory)
	}
	if len(uploads.cleaned) != 1 || uploads.cleaned[0].ID != trailingAttachment.ID {
		t.Fatalf("expected trailing attachment cleanup, got %#v", uploads.cleaned)
	}
}

func TestRegenerateAssistantMessageRejectsAssistantWithoutPreviousUser(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://preset.example.com/v1",
				APIKey:       "preset-key",
				DefaultModel: "preset-model",
			},
		},
	}, &fakeAttachmentStore{})

	assistantOnly := models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "Orphan reply",
		Status:         models.MessageStatusCompleted,
	}
	mustCreateMessageRecord(t, db, &assistantOnly)

	err := service.RegenerateAssistantMessage(
		context.Background(),
		user.ID,
		conversation.ID,
		assistantOnly.ID,
		nil,
		func(StreamEvent) error {
			return nil
		},
	)
	if !errors.Is(err, ErrInvalidRegenerateAction) {
		t.Fatalf("expected ErrInvalidRegenerateAction, got %v", err)
	}
}

func TestRetryAssistantMessageRejectsCompletedAssistant(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{
		resolved: &provider.ResolvedProvider{
			Config: llm.ProviderConfig{
				BaseURL:      "https://preset.example.com/v1",
				APIKey:       "preset-key",
				DefaultModel: "preset-model",
			},
		},
	}, &fakeAttachmentStore{})

	mustCreateMessageRecord(t, db, &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Question one",
		Status:         models.MessageStatusCompleted,
	})
	assistant := models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleAssistant,
		Content:        "Completed reply",
		Status:         models.MessageStatusCompleted,
	}
	mustCreateMessageRecord(t, db, &assistant)

	err := service.RetryAssistantMessage(
		context.Background(),
		user.ID,
		conversation.ID,
		assistant.ID,
		nil,
		func(StreamEvent) error {
			return nil
		},
	)
	if !errors.Is(err, ErrInvalidRetryAction) {
		t.Fatalf("expected ErrInvalidRetryAction, got %v", err)
	}
}

func newChatTestContext(t *testing.T) (*gorm.DB, models.User, models.Conversation) {
	t.Helper()

	dsn := fmt.Sprintf(
		"file:chat-%d?mode=memory&cache=shared&_busy_timeout=%d",
		time.Now().UnixNano(),
		5000,
	)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.Message{},
		&models.MessageAttachment{},
		&models.StoredAttachment{},
		&models.LLMProviderPreset{},
		&models.KnowledgeSpace{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	user := models.User{
		Username:     fmt.Sprintf("Elaina-%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	conversation := models.Conversation{UserID: user.ID, Title: defaultConversationTitle}
	if err := db.Create(&conversation).Error; err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	return db, user, conversation
}

func mustCreateMessageRecord(t *testing.T, db *gorm.DB, message *models.Message) {
	t.Helper()

	if err := createMessageRecord(db, message); err != nil {
		t.Fatalf("create message: %v", err)
	}
}

func createStoredAttachment(t *testing.T, db *gorm.DB, userID uint, attachment models.Attachment) {
	t.Helper()

	storedAttachment := models.StoredAttachment{
		ID:            attachment.ID,
		UserID:        userID,
		Name:          attachment.Name,
		MIMEType:      attachment.MIMEType,
		Size:          attachment.Size,
		StorageKey:    fmt.Sprintf("attachment-%s", attachment.ID),
		ExtractedText: attachment.Name,
	}
	if err := db.Create(&storedAttachment).Error; err != nil {
		t.Fatalf("create stored attachment: %v", err)
	}
}

func ptrString(value string) *string {
	return &value
}
