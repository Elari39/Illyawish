package admin

import (
	"errors"
	"fmt"

	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) ensureUsernameAvailable(username string) error {
	var count int64
	if err := s.db.Model(&models.User{}).
		Where("username = ?", username).
		Count(&count).Error; err != nil {
		return fmt.Errorf("check existing username: %w", err)
	}
	if count > 0 {
		return requestError{message: "username already exists", code: "validation_failed"}
	}
	return nil
}

func (s *Service) getUser(userID uint) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("load user: %w", err)
	}
	return &user, nil
}

func (s *Service) hasAnotherActiveAdmin(excludingUserID uint) (bool, error) {
	var count int64
	if err := s.db.Model(&models.User{}).
		Where("id <> ? AND role = ? AND status = ?", excludingUserID, models.UserRoleAdmin, models.UserStatusActive).
		Count(&count).Error; err != nil {
		return false, fmt.Errorf("count active admins: %w", err)
	}
	return count > 0, nil
}
