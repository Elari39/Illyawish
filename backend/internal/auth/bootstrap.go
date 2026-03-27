package auth

import (
	"errors"
	"fmt"

	"backend/internal/config"
	"backend/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var errBootstrapAlreadyComplete = errors.New("bootstrap already complete")

func EnsureBootstrapUser(db *gorm.DB, cfg *config.Config) error {
	username := cfg.BootstrapUsername
	password := cfg.BootstrapPassword
	if username == "" && password == "" {
		return nil
	}

	normalizedUsername, normalizedPassword, err := sanitizeCredentials(username, password)
	if err != nil {
		return fmt.Errorf("validate bootstrap credentials: %w", err)
	}

	_, err = createFirstUser(db, normalizedUsername, normalizedPassword)
	if err != nil && !errors.Is(err, errBootstrapAlreadyComplete) {
		return fmt.Errorf("create bootstrap user: %w", err)
	}

	return nil
}

func bootstrapRequired(db *gorm.DB) (bool, error) {
	var count int64
	if err := db.Model(&models.User{}).Count(&count).Error; err != nil {
		return false, fmt.Errorf("count users: %w", err)
	}
	return count == 0, nil
}

func createFirstUser(db *gorm.DB, username string, password string) (*models.User, error) {
	var createdUser *models.User

	if err := db.Transaction(func(tx *gorm.DB) error {
		required, err := bootstrapRequired(tx)
		if err != nil {
			return err
		}
		if !required {
			return errBootstrapAlreadyComplete
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash bootstrap password: %w", err)
		}

		user := &models.User{
			Username:       username,
			PasswordHash:   string(hash),
			Role:           models.UserRoleAdmin,
			Status:         models.UserStatusActive,
			SessionVersion: 1,
		}
		if err := tx.Create(user).Error; err != nil {
			return fmt.Errorf("create bootstrap user: %w", err)
		}

		createdUser = user
		return nil
	}); err != nil {
		return nil, err
	}

	return createdUser, nil
}
