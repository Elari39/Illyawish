package database

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMigrateLegacyMessageAttachmentsCreatesJoinRows(t *testing.T) {
	db := openDatabaseTestDB(t)

	message := models.Message{
		ConversationID: 1,
		Role:           models.RoleUser,
		Content:        "hello",
		LegacyAttachments: []models.Attachment{
			{ID: "att-1", Name: "image.png"},
		},
		Status: models.MessageStatusCompleted,
	}
	if err := db.Create(&message).Error; err != nil {
		t.Fatalf("create message: %v", err)
	}

	if err := migrateLegacyMessageAttachments(db); err != nil {
		t.Fatalf("migrateLegacyMessageAttachments() error = %v", err)
	}

	var count int64
	if err := db.Model(&models.MessageAttachment{}).
		Where("message_id = ? AND attachment_id = ?", message.ID, "att-1").
		Count(&count).Error; err != nil {
		t.Fatalf("count message attachments: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected migrated attachment link, got %d", count)
	}
}

func TestSchemaCreatesConversationAndProviderIndexes(t *testing.T) {
	db := openDatabaseTestDB(t)

	if !db.Migrator().HasIndex(&models.Conversation{}, "idx_conversations_user_view") {
		t.Fatal("expected conversation view index to exist")
	}
	if !db.Migrator().HasIndex(&models.LLMProviderPreset{}, "idx_provider_active_per_user") {
		t.Fatal("expected provider active-per-user index to exist")
	}
	if !db.Migrator().HasColumn(&models.User{}, "global_prompt") {
		t.Fatal("expected users.global_prompt column to exist")
	}
	if !db.Migrator().HasColumn(&models.User{}, "default_model") {
		t.Fatal("expected users.default_model column to exist")
	}
	if !db.Migrator().HasColumn(&models.User{}, "default_temperature") {
		t.Fatal("expected users.default_temperature column to exist")
	}
	if !db.Migrator().HasColumn(&models.User{}, "default_max_tokens") {
		t.Fatal("expected users.default_max_tokens column to exist")
	}
	if !db.Migrator().HasColumn(&models.User{}, "default_context_window_turns") {
		t.Fatal("expected users.default_context_window_turns column to exist")
	}
	if !db.Migrator().HasColumn(&models.Conversation{}, "context_window_turns") {
		t.Fatal("expected conversations.context_window_turns column to exist")
	}
	if !db.Migrator().HasColumn(&models.Conversation{}, "workflow_preset_id") {
		t.Fatal("expected conversations.workflow_preset_id column to exist")
	}
	if !db.Migrator().HasColumn(&models.Conversation{}, "knowledge_space_ids") {
		t.Fatal("expected conversations.knowledge_space_ids column to exist")
	}
	if !db.Migrator().HasColumn(&models.Conversation{}, "public_id") {
		t.Fatal("expected conversations.public_id column to exist")
	}
	if !db.Migrator().HasColumn(&models.Message{}, "run_summary") {
		t.Fatal("expected messages.run_summary column to exist")
	}
	if !db.Migrator().HasTable(&models.RAGProviderPreset{}) {
		t.Fatal("expected rag_provider_presets table to exist")
	}
	if !db.Migrator().HasTable(&models.KnowledgeSpace{}) {
		t.Fatal("expected knowledge_spaces table to exist")
	}
	if !db.Migrator().HasTable(&models.KnowledgeDocument{}) {
		t.Fatal("expected knowledge_documents table to exist")
	}
	if !db.Migrator().HasTable(&models.KnowledgeChunk{}) {
		t.Fatal("expected knowledge_chunks table to exist")
	}
	if !db.Migrator().HasTable(&models.WorkflowPreset{}) {
		t.Fatal("expected workflow_presets table to exist")
	}
}

func TestProviderActiveIndexAllowsOnlyOneActivePresetPerUser(t *testing.T) {
	db := openDatabaseTestDB(t)

	first := models.LLMProviderPreset{
		UserID:          7,
		Name:            "Primary",
		BaseURL:         "https://example.com/v1",
		EncryptedAPIKey: "encrypted-1",
		APIKeyHint:      "sk...1234",
		Models:          []string{"model-a"},
		DefaultModel:    "model-a",
		IsActive:        true,
	}
	if err := db.Create(&first).Error; err != nil {
		t.Fatalf("create first preset: %v", err)
	}

	second := models.LLMProviderPreset{
		UserID:          7,
		Name:            "Secondary",
		BaseURL:         "https://example.com/v1",
		EncryptedAPIKey: "encrypted-2",
		APIKeyHint:      "sk...5678",
		Models:          []string{"model-b"},
		DefaultModel:    "model-b",
		IsActive:        true,
	}
	if err := db.Create(&second).Error; err == nil {
		t.Fatal("expected second active preset insert to violate unique index")
	}
}

func TestOpenRejectsLegacyConversationSchemaWithoutPublicID(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy.db")

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}

	if err := db.Exec(`
		CREATE TABLE conversations (
			id INTEGER PRIMARY KEY,
			user_id INTEGER NOT NULL,
			title TEXT NOT NULL DEFAULT "New chat",
			is_pinned numeric NOT NULL DEFAULT false,
			is_archived numeric NOT NULL DEFAULT false,
			system_prompt TEXT NOT NULL DEFAULT "",
			model TEXT NOT NULL DEFAULT "",
			temperature REAL,
			max_tokens INTEGER,
			created_at datetime,
			updated_at datetime
		)
	`).Error; err != nil {
		t.Fatalf("create legacy conversations table: %v", err)
	}
	if err := db.Exec(`
		INSERT INTO conversations (
			id, user_id, title, is_pinned, is_archived, system_prompt, model, created_at, updated_at
		) VALUES (1, 1, 'Legacy chat', false, false, '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).Error; err != nil {
		t.Fatalf("insert legacy conversation row: %v", err)
	}

	_, err = Open(&config.Config{
		SQLitePath: dbPath,
		UploadDir:  filepath.Join(t.TempDir(), "uploads"),
	})
	if err == nil {
		t.Fatal("expected legacy schema check to fail")
	}

	if !strings.Contains(err.Error(), dbPath) {
		t.Fatalf("expected error to include db path %q, got %v", dbPath, err)
	}
	if !strings.Contains(err.Error(), "delete") || !strings.Contains(err.Error(), "restart") {
		t.Fatalf("expected delete-and-restart guidance, got %v", err)
	}
	if !strings.Contains(err.Error(), "public_id") {
		t.Fatalf("expected error to mention public_id, got %v", err)
	}
}

func openDatabaseTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:database-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.Message{},
		&models.MessageAttachment{},
		&models.LLMProviderPreset{},
		&models.RAGProviderPreset{},
		&models.StoredAttachment{},
		&models.KnowledgeSpace{},
		&models.KnowledgeDocument{},
		&models.KnowledgeChunk{},
		&models.WorkflowPreset{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	return db
}
