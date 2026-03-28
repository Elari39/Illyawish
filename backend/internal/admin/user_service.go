package admin

import (
	"fmt"
	"strings"

	"backend/internal/models"

	"golang.org/x/crypto/bcrypt"
)

func (s *Service) ListUsers() ([]models.User, error) {
	var users []models.User
	if err := s.db.Order("created_at asc").Find(&users).Error; err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	return users, nil
}

func (s *Service) CreateUser(actor *models.User, input UserInput) (*models.User, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return nil, requestError{message: "username is required", code: "validation_failed"}
	}
	if len(username) > 64 {
		return nil, requestError{message: "username must be 64 characters or fewer", code: "validation_failed"}
	}
	password := strings.TrimSpace(input.Password)
	if len(password) < 8 {
		return nil, requestError{message: "password must be at least 8 characters long", code: "validation_failed"}
	}

	policy, err := s.GetWorkspacePolicy()
	if err != nil {
		return nil, err
	}

	role, err := sanitizeRole(firstNonEmpty(strings.TrimSpace(input.Role), policy.DefaultUserRole))
	if err != nil {
		return nil, err
	}
	status, err := sanitizeStatus(firstNonEmpty(strings.TrimSpace(input.Status), models.UserStatusActive))
	if err != nil {
		return nil, err
	}

	maxConversations, err := sanitizeOptionalPositiveInt(coalesceIntPointer(input.MaxConversations, policy.DefaultUserMaxConversations), "max conversations")
	if err != nil {
		return nil, err
	}
	maxAttachments, err := sanitizeOptionalPositiveInt(coalesceIntPointer(input.MaxAttachmentsPerMessage, policy.DefaultUserMaxAttachmentsPerMsg), "max attachments per message")
	if err != nil {
		return nil, err
	}
	dailyMessageLimit, err := sanitizeOptionalPositiveInt(coalesceIntPointer(input.DailyMessageLimit, policy.DefaultUserDailyMessageLimit), "daily message limit")
	if err != nil {
		return nil, err
	}
	if err := s.ensureUsernameAvailable(username); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash user password: %w", err)
	}

	user := &models.User{
		Username:                 username,
		PasswordHash:             string(hash),
		Role:                     role,
		Status:                   status,
		SessionVersion:           1,
		MaxConversations:         maxConversations,
		MaxAttachmentsPerMessage: maxAttachments,
		DailyMessageLimit:        dailyMessageLimit,
	}
	if err := s.db.Create(user).Error; err != nil {
		if isDuplicateUsernameError(err) {
			return nil, requestError{message: "username already exists", code: "validation_failed"}
		}
		return nil, fmt.Errorf("create user: %w", err)
	}

	s.recordAudit(actor, "admin.user_created", user, fmt.Sprintf("Created user %s", user.Username))
	return user, nil
}

func (s *Service) UpdateUser(actor *models.User, userID uint, input UserUpdateInput) (*models.User, error) {
	user, err := s.getUser(userID)
	if err != nil {
		return nil, err
	}

	role, err := sanitizeRole(strings.TrimSpace(input.Role))
	if err != nil {
		return nil, err
	}
	status, err := sanitizeStatus(strings.TrimSpace(input.Status))
	if err != nil {
		return nil, err
	}
	maxConversations, err := sanitizeOptionalPositiveInt(input.MaxConversations, "max conversations")
	if err != nil {
		return nil, err
	}
	maxAttachments, err := sanitizeOptionalPositiveInt(input.MaxAttachmentsPerMessage, "max attachments per message")
	if err != nil {
		return nil, err
	}
	dailyMessageLimit, err := sanitizeOptionalPositiveInt(input.DailyMessageLimit, "daily message limit")
	if err != nil {
		return nil, err
	}

	if actor != nil && actor.ID == user.ID {
		if status == models.UserStatusDisabled {
			return nil, ErrCannotDisableSelf
		}
		if role != models.UserRoleAdmin {
			return nil, ErrCannotDemoteSelf
		}
	}
	if (user.Role == models.UserRoleAdmin && role != models.UserRoleAdmin) ||
		(user.Role == models.UserRoleAdmin && status != models.UserStatusActive) {
		ok, err := s.hasAnotherActiveAdmin(user.ID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrLastAdminRemoval
		}
	}

	user.Role = role
	user.Status = status
	user.MaxConversations = maxConversations
	user.MaxAttachmentsPerMessage = maxAttachments
	user.DailyMessageLimit = dailyMessageLimit
	if user.Status != models.UserStatusActive {
		user.SessionVersion += 1
	}
	if err := s.db.Model(user).Updates(map[string]any{
		"role":                        user.Role,
		"status":                      user.Status,
		"max_conversations":           user.MaxConversations,
		"max_attachments_per_message": user.MaxAttachmentsPerMessage,
		"daily_message_limit":         user.DailyMessageLimit,
		"session_version":             user.SessionVersion,
	}).Error; err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}

	s.recordAudit(actor, "admin.user_updated", user, fmt.Sprintf("Updated user %s", user.Username))
	return user, nil
}

func (s *Service) ResetPassword(actor *models.User, userID uint, input ResetPasswordInput) (*models.User, error) {
	user, err := s.getUser(userID)
	if err != nil {
		return nil, err
	}

	password := strings.TrimSpace(input.NewPassword)
	if len(password) < 8 {
		return nil, requestError{message: "password must be at least 8 characters long", code: "validation_failed"}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash reset password: %w", err)
	}

	user.PasswordHash = string(hash)
	user.SessionVersion += 1
	if err := s.db.Model(user).Updates(map[string]any{
		"password_hash":   user.PasswordHash,
		"session_version": user.SessionVersion,
	}).Error; err != nil {
		return nil, fmt.Errorf("reset user password: %w", err)
	}

	s.recordAudit(actor, "admin.user_password_reset", user, fmt.Sprintf("Reset password for %s", user.Username))
	return user, nil
}
