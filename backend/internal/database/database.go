package database

import (
	"fmt"
	"os"
	"path/filepath"

	"backend/internal/config"
	"backend/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const (
	defaultUsername = "Elaina"
	defaultPassword = "Eulus209"
)

func Open(cfg *config.Config) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(cfg.SQLitePath), 0o755); err != nil {
		return nil, fmt.Errorf("create sqlite directory: %w", err)
	}

	db, err := gorm.Open(sqlite.Open(cfg.SQLitePath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	if err := db.AutoMigrate(&models.User{}, &models.Conversation{}, &models.Message{}); err != nil {
		return nil, fmt.Errorf("auto migrate database: %w", err)
	}

	if err := ensureDefaultUser(db); err != nil {
		return nil, err
	}

	return db, nil
}

func ensureDefaultUser(db *gorm.DB) error {
	var count int64
	if err := db.Model(&models.User{}).Where("username = ?", defaultUsername).Count(&count).Error; err != nil {
		return fmt.Errorf("check default user: %w", err)
	}

	if count > 0 {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(defaultPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash default password: %w", err)
	}

	user := models.User{
		Username:     defaultUsername,
		PasswordHash: string(hash),
	}

	if err := db.Create(&user).Error; err != nil {
		return fmt.Errorf("create default user: %w", err)
	}

	return nil
}
