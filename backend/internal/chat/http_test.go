package chat

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/provider"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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
	missingConversationID := uuid.NewString()
	ctx.Request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/conversations/%s/messages", missingConversationID), nil)
	ctx.Params = gin.Params{{Key: "id", Value: missingConversationID}}
	ctx.Set("current_user", &user)

	NewHandler(service).ListMessages(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
	}
}

func TestListMessagesRejectsInvalidConversationPublicID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/conversations/not-a-uuid/messages", nil)
	ctx.Params = gin.Params{{Key: "id", Value: "not-a-uuid"}}
	ctx.Set("current_user", &models.User{ID: 1})

	NewHandler(nil).ListMessages(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "invalid conversation id") {
		t.Fatalf("expected invalid conversation id error, got %s", recorder.Body.String())
	}
}

func TestListMessagesReturnsPaginationMetadata(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, conversation := newChatTestContext(t)
	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{},
		&fakeAttachmentStore{},
	)

	for index := 0; index < 4; index += 1 {
		role := models.RoleUser
		if index%2 == 1 {
			role = models.RoleAssistant
		}
		mustCreateMessageRecord(t, db, &models.Message{
			ConversationID: conversation.ID,
			Role:           role,
			Content:        fmt.Sprintf("message-%d", index+1),
			Status:         models.MessageStatusCompleted,
		})
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	var conversationPublicID string
	if err := db.Raw("SELECT public_id FROM conversations WHERE id = ?", conversation.ID).Scan(&conversationPublicID).Error; err != nil {
		t.Fatalf("load conversation public id: %v", err)
	}
	ctx.Request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/conversations/%s/messages?limit=2", conversationPublicID), nil)
	ctx.Params = gin.Params{{Key: "id", Value: conversationPublicID}}
	ctx.Set("current_user", &user)

	NewHandler(service).ListMessages(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, "\"hasMore\":true") {
		t.Fatalf("expected pagination metadata in response, got %s", body)
	}
	if !strings.Contains(body, "\"nextBeforeId\"") {
		t.Fatalf("expected nextBeforeId in response, got %s", body)
	}
	if !strings.Contains(body, "\"content\":\"message-3\"") || !strings.Contains(body, "\"content\":\"message-4\"") {
		t.Fatalf("expected latest message page, got %s", body)
	}
	if !strings.Contains(body, "\"tags\":[]") {
		t.Fatalf("expected empty tags array in conversation response, got %s", body)
	}

	var response struct {
		Conversation struct {
			ID string `json:"id"`
		} `json:"conversation"`
		Messages []struct {
			ConversationID string `json:"conversationId"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.Conversation.ID == "" {
		t.Fatal("expected conversation id to be a UUID string")
	}
	if response.Conversation.ID != conversationPublicID {
		t.Fatalf("expected conversation id %q, got %q", conversationPublicID, response.Conversation.ID)
	}
	for _, message := range response.Messages {
		if message.ConversationID != conversationPublicID {
			t.Fatalf("expected message conversation id %q, got %q", conversationPublicID, message.ConversationID)
		}
	}
}

func TestListConversationsSerializesNilTagsAsEmptyArray(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, conversation := newChatTestContext(t)
	if err := db.Model(&models.Conversation{}).
		Where("id = ?", conversation.ID).
		Update("tags", nil).Error; err != nil {
		t.Fatalf("clear conversation tags: %v", err)
	}

	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{},
		&fakeAttachmentStore{},
	)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/conversations?archived=false", nil)
	ctx.Set("current_user", &user)

	NewHandler(service).ListConversations(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	if body := recorder.Body.String(); !strings.Contains(body, "\"tags\":[]") {
		t.Fatalf("expected empty tags array in response, got %s", body)
	}
}

func TestCancelGenerationReturnsOKWithoutActiveStream(t *testing.T) {
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
	var conversationPublicID string
	if err := db.Raw("SELECT public_id FROM conversations WHERE id = ?", conversation.ID).Scan(&conversationPublicID).Error; err != nil {
		t.Fatalf("load conversation public id: %v", err)
	}
	ctx.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/conversations/%s/cancel", conversationPublicID), nil)
	ctx.Params = gin.Params{{Key: "id", Value: conversationPublicID}}
	ctx.Set("current_user", &models.User{ID: user.ID})

	NewHandler(service).CancelGeneration(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "\"ok\":true") {
		t.Fatalf("expected ok response body, got %s", recorder.Body.String())
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
				ConversationID: uuid.NewString(),
				Role:           models.RoleAssistant,
				Status:         models.MessageStatusStreaming,
			},
			Metadata: map[string]any{
				"templateKey": "knowledge_qa",
				"stepIndex":   1,
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
	if !strings.Contains(body, `"metadata":{"stepIndex":1,"templateKey":"knowledge_qa"}`) {
		t.Fatalf("expected metadata in SSE event payload, got %s", body)
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
		t.Fatalf("expected imported conversation settings in body, got %s", recorder.Body.String())
	}
}

func TestCreateConversationReturnsQuotaExceededWhenConversationLimitReached(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, _ := newChatTestContext(t)
	maxConversations := 1
	if err := db.Model(&models.User{}).
		Where("id = ?", user.ID).
		Update("max_conversations", maxConversations).Error; err != nil {
		t.Fatalf("set max conversations: %v", err)
	}

	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{},
		&fakeAttachmentStore{},
	)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/conversations", nil)
	ctx.Set("current_user", &user)

	NewHandler(service).CreateConversation(ctx)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, recorder.Code)
	}
	if body := recorder.Body.String(); !strings.Contains(body, `"code":"quota_exceeded"`) {
		t.Fatalf("expected quota_exceeded response, got %s", body)
	}
}

func TestCreateConversationSerializesEmptyTagsArray(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, _ := newChatTestContext(t)
	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{},
		&fakeAttachmentStore{},
	)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/conversations", nil)
	ctx.Set("current_user", &user)

	NewHandler(service).CreateConversation(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, recorder.Code)
	}
	if body := recorder.Body.String(); !strings.Contains(body, "\"tags\":[]") {
		t.Fatalf("expected empty tags array in response, got %s", body)
	}
}

func TestCreateConversationAcceptsOptionalPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, _ := newChatTestContext(t)
	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{},
		&fakeAttachmentStore{},
	)

	payload := bytes.NewReader([]byte(`{
		"folder":"Work",
		"tags":["urgent","backend"],
		"workflowPresetId":11,
		"knowledgeSpaceIds":[3,5],
		"settings":{
			"systemPrompt":"Draft prompt",
			"model":"gpt-4.1-mini",
			"temperature":0.5,
			"maxTokens":1024,
			"contextWindowTurns":6
		}
	}`))

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/conversations", payload)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("current_user", &user)

	NewHandler(service).CreateConversation(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, recorder.Code)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, `"folder":"Work"`) {
		t.Fatalf("expected folder in response, got %s", body)
	}
	if !strings.Contains(body, `"tags":["urgent","backend"]`) {
		t.Fatalf("expected tags in response, got %s", body)
	}
	if !strings.Contains(body, `"workflowPresetId":11`) {
		t.Fatalf("expected workflow preset id in response, got %s", body)
	}
	if !strings.Contains(body, `"knowledgeSpaceIds":[3,5]`) {
		t.Fatalf("expected knowledge space ids in response, got %s", body)
	}
	if !strings.Contains(body, `"systemPrompt":"Draft prompt"`) {
		t.Fatalf("expected system prompt in response, got %s", body)
	}
	if !strings.Contains(body, `"model":"gpt-4.1-mini"`) {
		t.Fatalf("expected model in response, got %s", body)
	}
}

func TestRegenerateMessageByIDRejectsInvalidMessageID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, conversation := newChatTestContext(t)
	service := NewService(
		db,
		&fakeChatModel{},
		&fakeProviderResolver{},
		&fakeAttachmentStore{},
	)

	var conversationPublicID string
	if err := db.Raw("SELECT public_id FROM conversations WHERE id = ?", conversation.ID).Scan(&conversationPublicID).Error; err != nil {
		t.Fatalf("load conversation public id: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/conversations/%s/messages/bad/regenerate", conversationPublicID), nil)
	ctx.Params = gin.Params{
		{Key: "id", Value: conversationPublicID},
		{Key: "messageId", Value: "bad"},
	}
	ctx.Set("current_user", &models.User{ID: user.ID})

	NewHandler(service).RegenerateMessageByID(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}
}

func TestGetChatSettingsReturnsGlobalPrompt(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, _ := newChatTestContext(t)
	temperature := float32(0.8)
	maxTokens := 1024
	contextWindowTurns := 4
	if err := db.Model(&models.User{}).
		Where("id = ?", user.ID).
		Updates(map[string]any{
			"global_prompt":                "Use global prompt",
			"default_model":                "gpt-4.1-mini",
			"default_temperature":          &temperature,
			"default_max_tokens":           &maxTokens,
			"default_context_window_turns": &contextWindowTurns,
		}).Error; err != nil {
		t.Fatalf("update chat settings: %v", err)
	}

	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/chat/settings", nil)
	ctx.Set("current_user", &user)

	NewHandler(service).GetChatSettings(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "\"globalPrompt\":\"Use global prompt\"") {
		t.Fatalf("expected global prompt in response, got %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "\"model\":\"gpt-4.1-mini\"") {
		t.Fatalf("expected model in response, got %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "\"contextWindowTurns\":4") {
		t.Fatalf("expected context window in response, got %s", recorder.Body.String())
	}
}

func TestUpdateChatSettingsPersistsGlobalPrompt(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, user, _ := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	payload := bytes.NewReader([]byte(`{"globalPrompt":"Use global prompt","model":"gpt-4.1-mini","temperature":0.6,"maxTokens":2048,"contextWindowTurns":8}`))
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/chat/settings", payload)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("current_user", &user)

	NewHandler(service).UpdateChatSettings(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	settings, err := service.GetChatSettings(user.ID)
	if err != nil {
		t.Fatalf("GetChatSettings() error = %v", err)
	}
	if settings.GlobalPrompt != "Use global prompt" {
		t.Fatalf("expected global prompt to be persisted, got %q", settings.GlobalPrompt)
	}
	if settings.Model != "gpt-4.1-mini" {
		t.Fatalf("expected model to be persisted, got %q", settings.Model)
	}
	if settings.Temperature == nil || *settings.Temperature != float32(0.6) {
		t.Fatalf("expected temperature to be persisted, got %#v", settings.Temperature)
	}
	if settings.MaxTokens == nil || *settings.MaxTokens != 2048 {
		t.Fatalf("expected max tokens to be persisted, got %#v", settings.MaxTokens)
	}
	if settings.ContextWindowTurns == nil || *settings.ContextWindowTurns != 8 {
		t.Fatalf("expected context window to be persisted, got %#v", settings.ContextWindowTurns)
	}
}
