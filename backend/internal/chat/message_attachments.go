package chat

import (
	"fmt"

	"backend/internal/attachment"
	"backend/internal/models"

	"gorm.io/gorm"
)

func createMessageRecord(tx *gorm.DB, message *models.Message) error {
	attachments := cloneAttachments(message.Attachments)
	message.LegacyAttachments = cloneAttachments(attachments)

	if err := tx.Omit("Attachments", "AttachmentLinks").Create(message).Error; err != nil {
		return err
	}
	if err := replaceMessageAttachmentLinks(tx, message.ID, attachments); err != nil {
		return err
	}

	message.Attachments = attachments
	return nil
}

func updateMessageRecord(
	tx *gorm.DB,
	message *models.Message,
	content string,
	attachments []models.Attachment,
	status string,
) error {
	if err := tx.Model(message).Updates(map[string]any{
		"content":     content,
		"attachments": cloneAttachments(attachments),
		"status":      status,
	}).Error; err != nil {
		return err
	}
	if err := replaceMessageAttachmentLinks(tx, message.ID, attachments); err != nil {
		return err
	}

	message.Content = content
	message.LegacyAttachments = cloneAttachments(attachments)
	message.Attachments = cloneAttachments(attachments)
	message.Status = status
	return nil
}

func replaceMessageAttachmentLinks(
	tx *gorm.DB,
	messageID uint,
	attachments []models.Attachment,
) error {
	if err := tx.Where("message_id = ?", messageID).Delete(&models.MessageAttachment{}).Error; err != nil {
		return fmt.Errorf("delete message attachments: %w", err)
	}
	if len(attachments) == 0 {
		return nil
	}

	links := make([]models.MessageAttachment, 0, len(attachments))
	for index, messageAttachment := range attachments {
		if messageAttachment.ID == "" {
			continue
		}
		links = append(links, models.MessageAttachment{
			MessageID:    messageID,
			AttachmentID: messageAttachment.ID,
			Position:     index,
		})
	}
	if len(links) == 0 {
		return nil
	}

	if err := tx.Create(&links).Error; err != nil {
		return fmt.Errorf("create message attachments: %w", err)
	}
	return nil
}

func hydrateMessageAttachments(tx *gorm.DB, messages []models.Message) error {
	if len(messages) == 0 {
		return nil
	}

	messageIDs := make([]uint, 0, len(messages))
	for _, message := range messages {
		messageIDs = append(messageIDs, message.ID)
	}

	var links []models.MessageAttachment
	if err := tx.Preload("Attachment").
		Where("message_id IN ?", messageIDs).
		Order("message_id asc").
		Order("position asc").
		Find(&links).Error; err != nil {
		return fmt.Errorf("load message attachments: %w", err)
	}

	attachmentsByMessage := map[uint][]models.Attachment{}
	for _, link := range links {
		attachmentsByMessage[link.MessageID] = append(
			attachmentsByMessage[link.MessageID],
			attachment.ToAttachment(&link.Attachment),
		)
	}

	for index := range messages {
		if attachments, ok := attachmentsByMessage[messages[index].ID]; ok {
			messages[index].Attachments = attachments
			continue
		}
		messages[index].Attachments = cloneAttachments(messages[index].LegacyAttachments)
	}

	return nil
}

func cloneAttachments(attachments []models.Attachment) []models.Attachment {
	if len(attachments) == 0 {
		return nil
	}

	cloned := make([]models.Attachment, len(attachments))
	copy(cloned, attachments)
	return cloned
}
