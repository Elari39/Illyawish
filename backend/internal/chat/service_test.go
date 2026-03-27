package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/provider"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type fakeChatModel struct {
	chunks        []string
	finishReason  string
	err           error
	responses     []fakeStreamResponse
	callHistories [][]llm.ChatMessage
	lastHistory   []llm.ChatMessage
	lastProvider  llm.ProviderConfig
	lastOptions   llm.RequestOptions
	callCount     int
}

type fakeStreamResponse struct {
	chunks       []string
	finishReason string
	err          error
}

func (f *fakeChatModel) Stream(
	_ context.Context,
	providerConfig llm.ProviderConfig,
	history []llm.ChatMessage,
	options llm.RequestOptions,
	onDelta func(string),
) (llm.StreamResult, error) {
	f.lastProvider = providerConfig
	f.lastOptions = options
	f.lastHistory = append([]llm.ChatMessage(nil), history...)
	f.callHistories = append(f.callHistories, append([]llm.ChatMessage(nil), history...))

	response := fakeStreamResponse{
		chunks:       f.chunks,
		finishReason: f.finishReason,
		err:          f.err,
	}
	if f.callCount < len(f.responses) {
		response = f.responses[f.callCount]
	}
	f.callCount++

	full := ""
	for _, chunk := range response.chunks {
		full += chunk
		if onDelta != nil {
			onDelta(chunk)
		}
	}
	return llm.StreamResult{
		Content:      full,
		FinishReason: response.finishReason,
	}, response.err
}

type fakeProviderResolver struct {
	resolved *provider.ResolvedProvider
	err      error
}

func (f *fakeProviderResolver) ResolveForUser(uint) (*provider.ResolvedProvider, error) {
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
	updatedConversation, err := service.UpdateConversation(user.ID, conversation.ID, ConversationUpdateInput{
		Settings: &ConversationSettings{
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

func TestCreateConversationPersistsInitialMetadataAndSettings(t *testing.T) {
	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	temperature := float32(0.6)
	maxTokens := 1536
	contextWindowTurns := 8

	createdConversation, err := service.CreateConversation(user.ID, CreateConversationInput{
		Folder: ptrString("  Work  "),
		Tags:   &[]string{" urgent ", "backend", "URGENT"},
		Settings: &ConversationSettings{
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

	dsn := fmt.Sprintf("file:chat-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Conversation{}, &models.Message{}, &models.MessageAttachment{}, &models.StoredAttachment{}); err != nil {
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
		ID:         attachment.ID,
		UserID:     userID,
		Name:       attachment.Name,
		MIMEType:   attachment.MIMEType,
		Size:       attachment.Size,
		StorageKey: fmt.Sprintf("attachment-%s", attachment.ID),
		ExtractedText: attachment.Name,
	}
	if err := db.Create(&storedAttachment).Error; err != nil {
		t.Fatalf("create stored attachment: %v", err)
	}
}

func ptrString(value string) *string {
	return &value
}
