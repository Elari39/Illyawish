package chat

import (
	"net/http"

	"backend/internal/auth"

	"github.com/gin-gonic/gin"
)

type regenerateRequest struct {
	Options *ConversationSettings `json:"options"`
}

func (h *Handler) ListMessages(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	params, err := listMessagesParams(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	messagePage, err := h.service.ListMessagesPage(user.ID, conversation.ID, params)
	if err != nil {
		handleChatError(c, err)
		return
	}

	messageDTOs := make([]MessageDTO, 0, len(messagePage.Messages))
	for _, message := range messagePage.Messages {
		messageDTOs = append(messageDTOs, *ToMessageDTO(&message, conversation.PublicID))
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conversation": ToConversationDTO(conversation, effectiveSettings),
		"messages":     messageDTOs,
		"pagination": MessagePaginationDTO{
			HasMore:      messagePage.HasMore,
			NextBeforeID: messagePage.NextBeforeID,
		},
	})
}

func (h *Handler) CancelGeneration(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	if err := h.service.CancelGeneration(user.ID, conversation.ID); err != nil {
		handleChatError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) StreamMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	var req SendMessageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.StreamAssistantReply(
			c.Request.Context(),
			user.ID,
			conversation.ID,
			req,
			writeEvent,
		)
	})
}

func (h *Handler) RetryMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}
	messageID, err := messageIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var req regenerateRequest
	if err := bindOptionalJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid retry payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.RetryAssistantMessage(
			c.Request.Context(),
			user.ID,
			conversation.ID,
			messageID,
			req.Options,
			writeEvent,
		)
	})
}

func (h *Handler) RegenerateMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	var req regenerateRequest
	if err := bindOptionalJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid regenerate payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.RegenerateLastAssistantReply(
			c.Request.Context(),
			user.ID,
			conversation.ID,
			req.Options,
			writeEvent,
		)
	})
}

func (h *Handler) RegenerateMessageByID(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}
	messageID, err := messageIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var req regenerateRequest
	if err := bindOptionalJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid regenerate payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.RegenerateAssistantMessage(
			c.Request.Context(),
			user.ID,
			conversation.ID,
			messageID,
			req.Options,
			writeEvent,
		)
	})
}

func (h *Handler) EditMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}
	messageID, err := messageIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var req SendMessageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid edit payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.EditUserMessageAndRegenerate(
			c.Request.Context(),
			user.ID,
			conversation.ID,
			messageID,
			req,
			writeEvent,
		)
	})
}
