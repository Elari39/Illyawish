package database

import (
	"fmt"
	"os"
	"path/filepath"

	"backend/internal/config"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func Open(cfg *config.Config) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(cfg.SQLitePath), 0o755); err != nil {
		return nil, fmt.Errorf("create sqlite directory: %w", err)
	}

	db, err := gorm.Open(sqlite.Open(cfg.SQLitePath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	if err := rejectLegacyConversationSchema(db, cfg.SQLitePath); err != nil {
		return nil, err
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
		&models.AuditLog{},
		&models.WorkflowPreset{},
		&models.WorkspacePolicy{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate database: %w", err)
	}

	if err := migrateLegacyMessageAttachments(db); err != nil {
		return nil, err
	}
	if err := migrateUsersAndWorkspacePolicy(db); err != nil {
		return nil, err
	}

	return db, nil
}

func rejectLegacyConversationSchema(db *gorm.DB, sqlitePath string) error {
	if !db.Migrator().HasTable(&models.Conversation{}) {
		return nil
	}
	if db.Migrator().HasColumn(&models.Conversation{}, "public_id") {
		return nil
	}

	absolutePath, err := filepath.Abs(sqlitePath)
	if err != nil {
		absolutePath = sqlitePath
	}

	return fmt.Errorf(
		"legacy conversations schema detected in %s: conversations.public_id is missing; delete this SQLite file and restart the backend to recreate the database with UUID conversation URLs",
		absolutePath,
	)
}

func migrateUsersAndWorkspacePolicy(db *gorm.DB) error {
	if err := db.Model(&models.User{}).
		Where("role = '' OR role IS NULL").
		Update("role", models.UserRoleMember).Error; err != nil {
		return fmt.Errorf("backfill user role: %w", err)
	}
	if err := db.Model(&models.User{}).
		Where("status = '' OR status IS NULL").
		Update("status", models.UserStatusActive).Error; err != nil {
		return fmt.Errorf("backfill user status: %w", err)
	}
	if err := db.Model(&models.User{}).
		Where("session_version = 0").
		Update("session_version", 1).Error; err != nil {
		return fmt.Errorf("backfill session version: %w", err)
	}

	var adminCount int64
	if err := db.Model(&models.User{}).
		Where("role = ?", models.UserRoleAdmin).
		Count(&adminCount).Error; err != nil {
		return fmt.Errorf("count admin users: %w", err)
	}
	if adminCount == 0 {
		var firstUser models.User
		if err := db.Order("id asc").First(&firstUser).Error; err == nil {
			if err := db.Model(&firstUser).
				Updates(map[string]any{
					"role":   models.UserRoleAdmin,
					"status": models.UserStatusActive,
				}).Error; err != nil {
				return fmt.Errorf("promote first user to admin: %w", err)
			}
		}
	}

	var count int64
	if err := db.Model(&models.WorkspacePolicy{}).Count(&count).Error; err != nil {
		return fmt.Errorf("count workspace policies: %w", err)
	}
	if count == 0 {
		policy := models.WorkspacePolicy{
			ID:                      1,
			DefaultUserRole:         models.UserRoleMember,
			AttachmentRetentionDays: 30,
		}
		if err := db.Create(&policy).Error; err != nil {
			return fmt.Errorf("create default workspace policy: %w", err)
		}
	}

	if err := db.Model(&models.WorkspacePolicy{}).
		Where("attachment_retention_days <= 0").
		Update("attachment_retention_days", 30).Error; err != nil {
		return fmt.Errorf("backfill workspace attachment retention: %w", err)
	}

	return nil
}
