package chat

import (
	"context"
	"errors"
	"fmt"
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
	})

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
	})

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
	service := NewService(nil, &fakeChatModel{}, &fakeProviderResolver{})

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
	})

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

func newChatTestContext(t *testing.T) (*gorm.DB, models.User, models.Conversation) {
	t.Helper()

	dsn := fmt.Sprintf("file:chat-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Conversation{}, &models.Message{}); err != nil {
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
