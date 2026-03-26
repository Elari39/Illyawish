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
	chunks       []string
	err          error
	lastProvider llm.ProviderConfig
	lastOptions  llm.RequestOptions
}

func (f *fakeChatModel) Stream(
	_ context.Context,
	providerConfig llm.ProviderConfig,
	_ []llm.ChatMessage,
	options llm.RequestOptions,
	onDelta func(string),
) (string, error) {
	f.lastProvider = providerConfig
	f.lastOptions = options

	full := ""
	for _, chunk := range f.chunks {
		full += chunk
		onDelta(chunk)
	}
	return full, f.err
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

func TestResolveSettingsUsesConversationAndProviderModelPriority(t *testing.T) {
	service := NewService(nil, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	baseConversation := &models.Conversation{
		SystemPrompt: "",
		Model:        "",
	}

	settings, err := service.resolveSettings(baseConversation, nil, "provider-model")
	if err != nil {
		t.Fatalf("resolveSettings() error = %v", err)
	}
	if settings.Model != "provider-model" {
		t.Fatalf("expected provider default model, got %q", settings.Model)
	}

	baseConversation.Model = "conversation-model"
	settings, err = service.resolveSettings(baseConversation, nil, "provider-model")
	if err != nil {
		t.Fatalf("resolveSettings() error = %v", err)
	}
	if settings.Model != "conversation-model" {
		t.Fatalf("expected conversation model to win, got %q", settings.Model)
	}

	overrideModel := "override-model"
	settings, err = service.resolveSettings(baseConversation, &ConversationSettings{
		Model: overrideModel,
	}, "provider-model")
	if err != nil {
		t.Fatalf("resolveSettings() error = %v", err)
	}
	if settings.Model != overrideModel {
		t.Fatalf("expected override model to win, got %q", settings.Model)
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

func newChatTestContext(t *testing.T) (*gorm.DB, models.User, models.Conversation) {
	t.Helper()

	dsn := fmt.Sprintf("file:chat-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Conversation{}, &models.Message{}, &models.MessageAttachment{}); err != nil {
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
