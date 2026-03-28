package agent

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	confirmations *ConfirmationManager
}

func NewHandler(confirmations *ConfirmationManager) *Handler {
	return &Handler{confirmations: confirmations}
}

type confirmRequest struct {
	Approved bool `json:"approved"`
}

func (h *Handler) ConfirmToolCall(c *gin.Context) {
	var req confirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid confirmation payload"})
		return
	}
	if err := h.confirmations.Resolve(c.Param("id"), req.Approved); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
