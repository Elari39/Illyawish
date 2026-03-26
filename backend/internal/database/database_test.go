package database

import (
	"fmt"
	"testing"
	"time"

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
		&models.StoredAttachment{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	return db
}
