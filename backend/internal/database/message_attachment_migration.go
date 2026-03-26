package database

import (
	"fmt"

	"backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateLegacyMessageAttachments(db *gorm.DB) error {
	var messages []models.Message
	if err := db.Select("id", "attachments").Find(&messages).Error; err != nil {
		return fmt.Errorf("load legacy message attachments: %w", err)
	}

	for _, message := range messages {
		if len(message.LegacyAttachments) == 0 {
			continue
		}

		links := make([]models.MessageAttachment, 0, len(message.LegacyAttachments))
		for index, attachment := range message.LegacyAttachments {
			if attachment.ID == "" {
				continue
			}
			links = append(links, models.MessageAttachment{
				MessageID:    message.ID,
				AttachmentID: attachment.ID,
				Position:     index,
			})
		}
		if len(links) == 0 {
			continue
		}

		if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&links).Error; err != nil {
			return fmt.Errorf("migrate message %d attachments: %w", message.ID, err)
		}
	}

	return nil
}
