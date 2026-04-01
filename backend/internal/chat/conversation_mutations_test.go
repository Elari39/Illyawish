package chat

import (
	"testing"
	"time"

	"backend/internal/models"
)

func TestBuildConversationUpdatesSerializesMetadataAndSettings(t *testing.T) {
	db, user, conversation := newChatTestContext(t)
	service := NewService(db, &fakeChatModel{}, &fakeProviderResolver{}, &fakeAttachmentStore{})

	providerPresetID := uint(77)
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

	temperature := float32(0.7)
	maxTokens := 2048
	contextWindowTurns := 6

	updates, err := service.buildConversationUpdates(user.ID, &conversation, ConversationUpdateInput{
		Title:             ptrString("Renamed"),
		IsPinned:          ptrBool(true),
		IsArchived:        ptrBool(true),
		Folder:            ptrString(" Work "),
		Tags:              &[]string{" urgent ", "backend"},
		KnowledgeSpaceIDs: &[]uint{knowledgeSpaces[0].ID, knowledgeSpaces[1].ID},
		Settings: &ConversationSettings{
			ProviderPresetID:   &providerPresetID,
			SystemPrompt:       " Prompt ",
			Model:              " gpt-4.1-mini ",
			Temperature:        &temperature,
			MaxTokens:          &maxTokens,
			ContextWindowTurns: &contextWindowTurns,
		},
	})
	if err != nil {
		t.Fatalf("buildConversationUpdates() error = %v", err)
	}

	if updates["title"] != "Renamed" {
		t.Fatalf("expected title update, got %#v", updates["title"])
	}
	if updates["is_pinned"] != true {
		t.Fatalf("expected is_pinned update, got %#v", updates["is_pinned"])
	}
	if updates["is_archived"] != true {
		t.Fatalf("expected is_archived update, got %#v", updates["is_archived"])
	}
	if updates["folder"] != "Work" {
		t.Fatalf("expected folder to be sanitized, got %#v", updates["folder"])
	}
	if updates["tags"] != "[\"urgent\",\"backend\"]" {
		t.Fatalf("expected tags to be serialized, got %#v", updates["tags"])
	}
	if updates["knowledge_space_ids"] != "[1,2]" {
		t.Fatalf("expected knowledge space ids to be serialized, got %#v", updates["knowledge_space_ids"])
	}
	if updates["system_prompt"] != "Prompt" {
		t.Fatalf("expected system prompt to be sanitized, got %#v", updates["system_prompt"])
	}
	updatedProviderPresetID, ok := updates["provider_preset_id"].(*uint)
	if !ok || updatedProviderPresetID == nil || *updatedProviderPresetID != providerPresetID {
		t.Fatalf("expected provider preset id update, got %#v", updates["provider_preset_id"])
	}
	if updates["model"] != "gpt-4.1-mini" {
		t.Fatalf("expected model to be sanitized, got %#v", updates["model"])
	}
	updatedTemperature, ok := updates["temperature"].(*float32)
	if !ok || updatedTemperature == nil || *updatedTemperature != temperature {
		t.Fatalf("expected temperature update, got %#v", updates["temperature"])
	}
	updatedMaxTokens, ok := updates["max_tokens"].(*int)
	if !ok || updatedMaxTokens == nil || *updatedMaxTokens != maxTokens {
		t.Fatalf("expected max tokens update, got %#v", updates["max_tokens"])
	}
	updatedContextWindowTurns, ok := updates["context_window_turns"].(*int)
	if !ok || updatedContextWindowTurns == nil || *updatedContextWindowTurns != contextWindowTurns {
		t.Fatalf("expected context window turns update, got %#v", updates["context_window_turns"])
	}
	updatedAt, ok := updates["updated_at"].(time.Time)
	if !ok {
		t.Fatalf("expected updated_at timestamp, got %#v", updates["updated_at"])
	}
	if updatedAt.IsZero() {
		t.Fatal("expected updated_at to be set")
	}
}

func ptrBool(value bool) *bool {
	return &value
}
