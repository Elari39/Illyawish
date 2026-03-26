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

	if err := db.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.Message{},
		&models.LLMProviderPreset{},
		&models.StoredAttachment{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate database: %w", err)
	}

	return db, nil
}
