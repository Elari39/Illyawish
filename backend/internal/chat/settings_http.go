package chat

import (
	"net/http"

	"backend/internal/auth"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GetChatSettings(c *gin.Context) {
	user := auth.CurrentUser(c)
	settings, err := h.service.GetChatSettings(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get chat settings"})
		return
	}

	c.JSON(http.StatusOK, ToChatSettingsDTO(settings))
}

func (h *Handler) UpdateChatSettings(c *gin.Context) {
	user := auth.CurrentUser(c)

	var req ChatSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid chat settings payload"})
		return
	}

	settings, err := h.service.UpdateChatSettings(user.ID, req)
	if err != nil {
		handleChatError(c, err)
		return
	}

	c.JSON(http.StatusOK, ToChatSettingsDTO(settings))
}
