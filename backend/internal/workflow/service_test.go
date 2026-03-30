package workflow

import (
	"fmt"
	"testing"
	"time"

	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCatalogIncludesRequiredBuiltInTemplates(t *testing.T) {
	requiredKeys := []string{
		TemplateKnowledgeQA,
		TemplateDocumentSummary,
		TemplateMultiDocumentCompare,
		TemplateWebpageDigest,
		TemplateStructuredExtraction,
	}

	catalog := BuiltInCatalog()
	for _, key := range requiredKeys {
		if _, ok := catalog[key]; !ok {
			t.Fatalf("expected built-in template %q to exist", key)
		}
	}
}

func TestCreateWorkflowPresetStoresDefaults(t *testing.T) {
	service := newTestService(t)

	preset, err := service.CreatePreset(3, CreatePresetInput{
		Name:              "My QA Flow",
		TemplateKey:       TemplateKnowledgeQA,
		DefaultInputs:     map[string]any{"questionStyle": "deep"},
		KnowledgeSpaceIDs: []uint{2, 4},
		ToolEnablements:   map[string]bool{"knowledge_search": true},
		OutputMode:        "markdown",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	if preset.TemplateKey != TemplateKnowledgeQA {
		t.Fatalf("expected template key to persist, got %q", preset.TemplateKey)
	}
	if len(preset.KnowledgeSpaceIDs) != 2 {
		t.Fatalf("expected knowledge space defaults to persist, got %#v", preset.KnowledgeSpaceIDs)
	}
}

func TestListPresetsIsUserScoped(t *testing.T) {
	service := newTestService(t)

	if _, err := service.CreatePreset(1, CreatePresetInput{
		Name:        "User 1 preset",
		TemplateKey: TemplateKnowledgeQA,
	}); err != nil {
		t.Fatalf("CreatePreset(user1) error = %v", err)
	}
	if _, err := service.CreatePreset(2, CreatePresetInput{
		Name:        "User 2 preset",
		TemplateKey: TemplateWebpageDigest,
	}); err != nil {
		t.Fatalf("CreatePreset(user2) error = %v", err)
	}

	presets, err := service.ListPresets(1)
	if err != nil {
		t.Fatalf("ListPresets() error = %v", err)
	}
	if len(presets) != 1 || presets[0].Name != "User 1 preset" {
		t.Fatalf("expected only user 1 preset, got %#v", presets)
	}
}

func TestGetPresetIsUserScoped(t *testing.T) {
	service := newTestService(t)

	created, err := service.CreatePreset(1, CreatePresetInput{
		Name:        "User 1 preset",
		TemplateKey: TemplateKnowledgeQA,
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	if _, err := service.GetPreset(2, created.ID); err == nil {
		t.Fatal("expected cross-user preset lookup to fail")
	}

	loaded, err := service.GetPreset(1, created.ID)
	if err != nil {
		t.Fatalf("GetPreset() error = %v", err)
	}
	if loaded.ID != created.ID {
		t.Fatalf("expected preset %d, got %d", created.ID, loaded.ID)
	}
}

func TestUpdatePresetUpdatesSelectedFields(t *testing.T) {
	service := newTestService(t)

	created, err := service.CreatePreset(1, CreatePresetInput{
		Name:              "Original",
		TemplateKey:       TemplateKnowledgeQA,
		DefaultInputs:     map[string]any{"style": "brief"},
		KnowledgeSpaceIDs: []uint{1},
		ToolEnablements:   map[string]bool{"knowledge_search": true},
		OutputMode:        "markdown",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	nextName := "Updated"
	nextTemplateKey := TemplateWebpageDigest
	nextOutputMode := "default"
	updated, err := service.UpdatePreset(1, created.ID, UpdatePresetInput{
		Name:              &nextName,
		TemplateKey:       &nextTemplateKey,
		DefaultInputs:     map[string]any{"url": "https://example.com"},
		KnowledgeSpaceIDs: []uint{3, 4},
		ToolEnablements:   map[string]bool{"fetch_url": true},
		OutputMode:        &nextOutputMode,
	})
	if err != nil {
		t.Fatalf("UpdatePreset() error = %v", err)
	}

	if updated.Name != nextName {
		t.Fatalf("expected name %q, got %q", nextName, updated.Name)
	}
	if updated.TemplateKey != nextTemplateKey {
		t.Fatalf("expected template key %q, got %q", nextTemplateKey, updated.TemplateKey)
	}
	if len(updated.KnowledgeSpaceIDs) != 2 || updated.KnowledgeSpaceIDs[0] != 3 || updated.KnowledgeSpaceIDs[1] != 4 {
		t.Fatalf("expected knowledge spaces to update, got %#v", updated.KnowledgeSpaceIDs)
	}
	if updated.OutputMode != nextOutputMode {
		t.Fatalf("expected output mode %q, got %q", nextOutputMode, updated.OutputMode)
	}
}

func TestUpdatePresetRejectsInvalidTemplateKey(t *testing.T) {
	service := newTestService(t)

	created, err := service.CreatePreset(1, CreatePresetInput{
		Name:        "Original",
		TemplateKey: TemplateKnowledgeQA,
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	invalidTemplateKey := "missing_template"
	if _, err := service.UpdatePreset(1, created.ID, UpdatePresetInput{
		TemplateKey: &invalidTemplateKey,
	}); err == nil {
		t.Fatal("expected invalid template key update to fail")
	}
}

func TestDeletePresetRemovesPreset(t *testing.T) {
	service := newTestService(t)

	created, err := service.CreatePreset(1, CreatePresetInput{
		Name:        "Delete me",
		TemplateKey: TemplateKnowledgeQA,
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	if err := service.DeletePreset(1, created.ID); err != nil {
		t.Fatalf("DeletePreset() error = %v", err)
	}

	if _, err := service.GetPreset(1, created.ID); err == nil {
		t.Fatal("expected deleted preset lookup to fail")
	}
}

func TestDeletePresetClearsConversationReferencesForSameUser(t *testing.T) {
	service := newTestService(t)

	created, err := service.CreatePreset(1, CreatePresetInput{
		Name:        "Delete me",
		TemplateKey: TemplateKnowledgeQA,
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	sameUserConversation := models.Conversation{
		UserID:           1,
		Title:            "Same user",
		WorkflowPresetID: &created.ID,
	}
	if err := service.db.Create(&sameUserConversation).Error; err != nil {
		t.Fatalf("create same-user conversation: %v", err)
	}

	otherUserConversation := models.Conversation{
		UserID:           2,
		Title:            "Other user",
		WorkflowPresetID: &created.ID,
	}
	if err := service.db.Create(&otherUserConversation).Error; err != nil {
		t.Fatalf("create other-user conversation: %v", err)
	}

	if err := service.DeletePreset(1, created.ID); err != nil {
		t.Fatalf("DeletePreset() error = %v", err)
	}

	if _, err := service.GetPreset(1, created.ID); err == nil {
		t.Fatal("expected deleted preset lookup to fail")
	}

	var reloadedSameUser models.Conversation
	if err := service.db.First(&reloadedSameUser, sameUserConversation.ID).Error; err != nil {
		t.Fatalf("reload same-user conversation: %v", err)
	}
	if reloadedSameUser.WorkflowPresetID != nil {
		t.Fatalf("expected same-user workflow preset reference to be cleared, got %v", *reloadedSameUser.WorkflowPresetID)
	}

	var reloadedOtherUser models.Conversation
	if err := service.db.First(&reloadedOtherUser, otherUserConversation.ID).Error; err != nil {
		t.Fatalf("reload other-user conversation: %v", err)
	}
	if reloadedOtherUser.WorkflowPresetID == nil || *reloadedOtherUser.WorkflowPresetID != created.ID {
		t.Fatalf("expected other-user workflow preset reference to remain, got %v", reloadedOtherUser.WorkflowPresetID)
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()

	dsn := fmt.Sprintf("file:workflow-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.WorkflowPreset{}); err != nil {
		t.Fatalf("migrate workflow preset: %v", err)
	}
	if err := db.AutoMigrate(&models.Conversation{}); err != nil {
		t.Fatalf("migrate conversation: %v", err)
	}

	return NewService(db)
}
