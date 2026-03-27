package chat

import (
	"errors"
	"fmt"
	"time"

	"backend/internal/models"
)

type quotaExceededError struct {
	message string
}

func (e quotaExceededError) Error() string {
	return e.message
}

func isQuotaExceededError(err error) bool {
	var target quotaExceededError
	return errors.As(err, &target)
}

type userQuotaSettings struct {
	MaxConversations         *int
	MaxAttachmentsPerMessage *int
	DailyMessageLimit        *int
}

func (s *Service) enforceConversationQuota(userID uint) error {
	quota, err := s.userQuotas(userID)
	if err != nil {
		return err
	}
	if quota.MaxConversations == nil {
		return nil
	}

	var count int64
	if err := s.db.Model(&models.Conversation{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
		return fmt.Errorf("count user conversations: %w", err)
	}
	if count >= int64(*quota.MaxConversations) {
		return quotaExceeded("conversation quota reached")
	}
	return nil
}

func (s *Service) enforceDailyMessageQuota(userID uint) error {
	quota, err := s.userQuotas(userID)
	if err != nil {
		return err
	}
	if quota.DailyMessageLimit == nil {
		return nil
	}

	startOfDay := time.Now().UTC().Truncate(24 * time.Hour)
	var count int64
	if err := s.db.Model(&models.Message{}).
		Joins("JOIN conversations ON conversations.id = messages.conversation_id").
		Where("conversations.user_id = ? AND messages.role = ? AND messages.created_at >= ?", userID, models.RoleUser, startOfDay).
		Count(&count).Error; err != nil {
		return fmt.Errorf("count daily messages: %w", err)
	}
	if count >= int64(*quota.DailyMessageLimit) {
		return quotaExceeded("daily message quota reached")
	}
	return nil
}

func (s *Service) enforceAttachmentQuota(userID uint, attachmentCount int) error {
	if attachmentCount == 0 {
		return nil
	}

	quota, err := s.userQuotas(userID)
	if err != nil {
		return err
	}

	effectiveMax := 4
	if quota.MaxAttachmentsPerMessage != nil && *quota.MaxAttachmentsPerMessage < effectiveMax {
		effectiveMax = *quota.MaxAttachmentsPerMessage
	}
	if attachmentCount > effectiveMax {
		return quotaExceeded("attachment quota reached")
	}
	return nil
}

func (s *Service) userQuotas(userID uint) (*userQuotaSettings, error) {
	var user models.User
	if err := s.db.Select(
		"max_conversations",
		"max_attachments_per_message",
		"daily_message_limit",
	).First(&user, userID).Error; err != nil {
		return nil, fmt.Errorf("load user quotas: %w", err)
	}

	return &userQuotaSettings{
		MaxConversations:         cloneInt(user.MaxConversations),
		MaxAttachmentsPerMessage: cloneInt(user.MaxAttachmentsPerMessage),
		DailyMessageLimit:        cloneInt(user.DailyMessageLimit),
	}, nil
}

func quotaExceeded(message string) error {
	return quotaExceededError{message: message}
}
