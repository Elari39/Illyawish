package chat

import (
	"net/http"

	"backend/internal/auth"
	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListConversations(c *gin.Context) {
	user := auth.CurrentUser(c)
	params, err := listConversationsParams(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.service.ListConversations(user.ID, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list conversations"})
		return
	}

	resp := make([]ConversationDTO, 0, len(result.Conversations))
	for _, conversation := range result.Conversations {
		effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, &conversation)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
			return
		}
		resp = append(resp, ToConversationDTO(&conversation, effectiveSettings))
	}

	c.JSON(http.StatusOK, gin.H{
		"conversations": resp,
		"total":         result.Total,
	})
}

func (h *Handler) CreateConversation(c *gin.Context) {
	user := auth.CurrentUser(c)

	var req CreateConversationInput
	if err := bindOptionalJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation payload"})
		return
	}

	conversation, err := h.service.CreateConversation(user.ID, req)
	if err != nil {
		handleChatError(c, err)
		return
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"conversation": ToConversationDTO(conversation, effectiveSettings)})
}

func (h *Handler) ImportConversation(c *gin.Context) {
	user := auth.CurrentUser(c)

	var req ImportConversationInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid import payload"})
		return
	}

	conversation, err := h.service.ImportConversation(user.ID, req)
	if err != nil {
		handleChatError(c, err)
		return
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"conversation": ToConversationDTO(conversation, effectiveSettings)})
}

func (h *Handler) UpdateConversation(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	var req ConversationUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation payload"})
		return
	}

	conversation, err = h.service.UpdateConversation(user.ID, conversation.ID, req)
	if err != nil {
		handleChatError(c, err)
		return
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"conversation": ToConversationDTO(conversation, effectiveSettings)})
}

func (h *Handler) DeleteConversation(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.conversationParam(c, user.ID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	if err := h.service.DeleteConversation(user.ID, conversation.ID); err != nil {
		handleChatError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) conversationParam(c *gin.Context, userID uint) (*models.Conversation, error) {
	conversationPublicID, err := conversationIDParam(c)
	if err != nil {
		return nil, requestError{message: "invalid conversation id"}
	}
	return h.service.GetConversationByPublicID(userID, conversationPublicID)
}
