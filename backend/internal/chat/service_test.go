package chat

import (
	"context"
	"errors"
	"testing"

	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type fakeChatModel struct {
	chunks []string
	err    error
}

func (f *fakeChatModel) Stream(
	_ context.Context,
	_ []llm.ChatMessage,
	_ llm.RequestOptions,
	onDelta func(string),
) (string, error) {
	full := ""
	for _, chunk := range f.chunks {
		full += chunk
		onDelta(chunk)
	}
	return full, f.err
}

func TestStreamAssistantReplyMarksFailedMessages(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Conversation{}, &models.Message{}); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	user := models.User{Username: "Elaina", PasswordHash: "hash"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	conversation := models.Conversation{UserID: user.ID, Title: defaultConversationTitle}
	if err := db.Create(&conversation).Error; err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	service := NewService(db, &fakeChatModel{
		chunks: []string{"partial"},
		err:    errors.New("upstream failed"),
	}, "test-model")

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
