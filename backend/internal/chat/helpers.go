package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/gorm"
)

func includeMessageInHistory(message models.Message) bool {
	if message.Role == models.RoleAssistant && message.Status != models.MessageStatusCompleted {
		return false
	}
	return strings.TrimSpace(message.Content) != "" || len(message.Attachments) > 0
}

func trimHistoryToRecentTurns(
	history []llm.ChatMessage,
	contextWindowTurns *int,
) []llm.ChatMessage {
	if contextWindowTurns == nil || *contextWindowTurns <= 0 {
		return history
	}

	userTurns := 0
	startIndex := 0
	for index := len(history) - 1; index >= 0; index-- {
		if history[index].Role != models.RoleUser {
			continue
		}
		userTurns++
		startIndex = index
		if userTurns >= *contextWindowTurns {
			return history[startIndex:]
		}
	}

	return history
}

func shouldAutoContinue(
	result llm.StreamResult,
	streamErr error,
) bool {
	if result.FinishReason == "length" {
		return true
	}

	if streamErr == nil || result.Content == "" {
		return false
	}

	if errors.Is(streamErr, context.Canceled) {
		return false
	}

	return isRecoverableStreamError(streamErr)
}

func isRecoverableStreamError(err error) bool {
	if err == nil {
		return false
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "unexpected eof") ||
		strings.HasSuffix(message, "eof") ||
		strings.Contains(message, "connection reset") ||
		strings.Contains(message, "broken pipe") ||
		strings.Contains(message, "stream closed") ||
		strings.Contains(message, "timeout") ||
		strings.Contains(message, "closed network connection")
}

func deriveConversationTitle(content string, attachments []models.Attachment) string {
	content = strings.TrimSpace(content)
	if content == "" && len(attachments) > 0 {
		title := strings.TrimSpace(attachments[0].Name)
		if title == "" {
			return "Image chat"
		}
		content = "Image: " + title
	}
	if content == "" {
		return defaultConversationTitle
	}

	const maxRunes = 30
	if utf8.RuneCountInString(content) <= maxRunes {
		return content
	}

	runes := []rune(content)
	return string(runes[:maxRunes]) + "..."
}

func conversationMessageByID(tx *gorm.DB, conversationID uint, messageID uint) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ? AND id = ?", conversationID, messageID).First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load message: %w", err)
	}
	return &message, nil
}

func latestConversationMessage(tx *gorm.DB, conversationID uint) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ?", conversationID).Order("id desc").First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load latest message: %w", err)
	}
	return &message, nil
}

func latestConversationMessageByRole(
	tx *gorm.DB,
	conversationID uint,
	role string,
) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ? AND role = ?", conversationID, role).
		Order("id desc").
		First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load latest %s message: %w", role, err)
	}
	return &message, nil
}

func previousUserMessage(tx *gorm.DB, conversationID uint, beforeMessageID uint) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ? AND role = ? AND id < ?", conversationID, models.RoleUser, beforeMessageID).
		Order("id desc").
		First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load previous user message: %w", err)
	}
	return &message, nil
}

func escapeLike(input string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_")
	return replacer.Replace(input)
}

func containsStatus(statuses []string, candidate string) bool {
	for _, status := range statuses {
		if status == candidate {
			return true
		}
	}
	return false
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func collectMessageAttachments(messages []models.Message) []models.Attachment {
	attachments := make([]models.Attachment, 0)
	for _, message := range messages {
		attachments = append(attachments, messageAttachments(message)...)
	}
	return attachments
}

func messageAttachments(message models.Message) []models.Attachment {
	if len(message.Attachments) > 0 {
		return message.Attachments
	}
	return message.LegacyAttachments
}
