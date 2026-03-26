package chat

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/provider"

	"github.com/gin-gonic/gin"
)

func TestListConversationsRejectsInvalidArchivedQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/conversations?archived=invalid", nil)

	NewHandler(nil).ListConversations(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "archived must be a boolean") {
		t.Fatalf("expected archived validation error, got %s", recorder.Body.String())
	}
}

func TestListMessagesReturnsNotFoundForMissingConversation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, _ := newChatTestContext(t)
	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{
			resolved: &provider.ResolvedProvider{
				Config: llm.ProviderConfig{
					BaseURL:      "https://example.com/v1",
					APIKey:       "key",
					DefaultModel: "model",
				},
			},
		},
		&fakeAttachmentStore{},
	)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/conversations/999/messages", nil)
	ctx.Params = gin.Params{{Key: "id", Value: "999"}}
	ctx.Set("current_user", &user)

	NewHandler(service).ListMessages(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
	}
}

func TestCancelGenerationReturnsConflictWithoutActiveStream(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, conversation := newChatTestContext(t)
	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{
			resolved: &provider.ResolvedProvider{
				Config: llm.ProviderConfig{
					BaseURL:      "https://example.com/v1",
					APIKey:       "key",
					DefaultModel: "model",
				},
			},
		},
		&fakeAttachmentStore{},
	)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/conversations/1/cancel", nil)
	ctx.Params = gin.Params{{Key: "id", Value: "1"}}
	ctx.Set("current_user", &models.User{ID: user.ID})

	NewHandler(service).CancelGeneration(ctx)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d", http.StatusConflict, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), ErrNoActiveGeneration.Error()) {
		t.Fatalf("expected no active generation error, got %s", recorder.Body.String())
	}

	_ = conversation
}

func TestStreamActionWritesSSEHeadersAndErrorEvent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/test", nil)

	handler := &Handler{}
	handler.streamAction(ctx, func(writeEvent func(StreamEvent) error) error {
		if err := writeEvent(StreamEvent{
			Type: "message_start",
			Message: &MessageDTO{
				ID:             1,
				ConversationID: 2,
				Role:           models.RoleAssistant,
				Status:         models.MessageStatusStreaming,
			},
		}); err != nil {
			return err
		}

		return requestError{message: "stream exploded"}
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	if got := recorder.Header().Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("expected text/event-stream content type, got %q", got)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("expected no-cache header, got %q", got)
	}
	if got := recorder.Header().Get("X-Accel-Buffering"); got != "no" {
		t.Fatalf("expected X-Accel-Buffering header to be no, got %q", got)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, "event: message_start") {
		t.Fatalf("expected message_start event, got %s", body)
	}
	if !strings.Contains(body, "event: error") {
		t.Fatalf("expected error event, got %s", body)
	}
	if !strings.Contains(body, "stream exploded") {
		t.Fatalf("expected request error body, got %s", body)
	}
}

func TestImportConversationReturnsCreatedConversation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, _ := newChatTestContext(t)
	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{},
		&fakeAttachmentStore{},
	)

	payload, err := json.Marshal(ImportConversationInput{
		Title: "Imported chat",
		Settings: &ConversationSettings{
			Model: "gpt-4.1-mini",
		},
		Messages: []ImportMessageInput{
			{
				Role:    models.RoleUser,
				Content: "Hello import",
			},
			{
				Role:    models.RoleAssistant,
				Content: "Hello back",
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/conversations/import", bytes.NewReader(payload))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("current_user", &user)

	NewHandler(service).ImportConversation(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "\"title\":\"Imported chat\"") {
		t.Fatalf("expected imported conversation body, got %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "\"model\":\"gpt-4.1-mini\"") {
		t.Fatalf("expected imported model in response, got %s", recorder.Body.String())
	}
}
