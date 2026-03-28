package chat

import (
	"fmt"

	"backend/internal/models"
)

type ListMessagesParams struct {
	Limit    int
	BeforeID *uint
}

type MessageListResult struct {
	Messages     []models.Message
	HasMore      bool
	NextBeforeID *uint
}

func (s *Service) ListMessagesPage(
	userID uint,
	conversationID uint,
	params ListMessagesParams,
) (*MessageListResult, error) {
	if _, err := s.GetConversation(userID, conversationID); err != nil {
		return nil, err
	}

	limit := params.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := s.db.Where("conversation_id = ?", conversationID).Order("id desc")
	if params.BeforeID != nil && *params.BeforeID > 0 {
		query = query.Where("id < ?", *params.BeforeID)
	}

	var messages []models.Message
	if err := query.Limit(limit + 1).Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("list messages page: %w", err)
	}

	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}
	reverseMessages(messages)
	if err := hydrateMessageAttachments(s.db, messages); err != nil {
		return nil, err
	}

	var nextBeforeID *uint
	if hasMore && len(messages) > 0 {
		nextBeforeID = ptrUint(messages[0].ID)
	}

	return &MessageListResult{
		Messages:     messages,
		HasMore:      hasMore,
		NextBeforeID: nextBeforeID,
	}, nil
}

func reverseMessages(messages []models.Message) {
	for left, right := 0, len(messages)-1; left < right; left, right = left+1, right-1 {
		messages[left], messages[right] = messages[right], messages[left]
	}
}

func ptrUint(value uint) *uint {
	return &value
}
