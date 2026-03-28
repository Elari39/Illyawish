package admin

import (
	"fmt"
	"strconv"

	"backend/internal/models"
)

type AttachmentPurgeScope string

const (
	AttachmentPurgeScopeUser AttachmentPurgeScope = "user"
	AttachmentPurgeScopeAll  AttachmentPurgeScope = "all"
)

func (s *Service) PurgeAttachmentsForUser(actor *models.User, userID uint) (int, *models.User, error) {
	if s.attachments == nil {
		return 0, nil, fmt.Errorf("attachment manager unavailable")
	}

	targetUser, err := s.getUser(userID)
	if err != nil {
		return 0, nil, err
	}

	deletedCount, err := s.attachments.DeleteAllForUser(userID)
	if err != nil {
		return 0, nil, fmt.Errorf("delete user attachments: %w", err)
	}
	if s.audit != nil {
		summary := fmt.Sprintf("Deleted %d attachments for %s", deletedCount, targetUser.Username)
		_ = s.audit.Record(
			actor,
			"admin.attachments_deleted_for_user",
			"user",
			strconv.FormatUint(uint64(targetUser.ID), 10),
			targetUser.Username,
			summary,
		)
	}

	return deletedCount, targetUser, nil
}

func (s *Service) PurgeAllAttachments(actor *models.User) (int, error) {
	if s.attachments == nil {
		return 0, fmt.Errorf("attachment manager unavailable")
	}

	deletedCount, err := s.attachments.DeleteAll()
	if err != nil {
		return 0, fmt.Errorf("delete all attachments: %w", err)
	}
	if s.audit != nil {
		summary := fmt.Sprintf("Deleted %d attachments across the workspace", deletedCount)
		_ = s.audit.Record(actor, "admin.attachments_deleted_all", "workspace", "attachments", "workspace", summary)
	}

	return deletedCount, nil
}
