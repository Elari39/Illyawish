package chat

import (
	"errors"
	"net/http"

	"backend/internal/provider"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func handleChatError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation or message not found"})
	case errors.Is(err, ErrConversationBusy),
		errors.Is(err, ErrNoActiveGeneration),
		errors.Is(err, ErrNoActiveStream),
		errors.Is(err, ErrInvalidRetryAction),
		errors.Is(err, ErrInvalidRegenerateAction),
		errors.Is(err, ErrInvalidUserEdit):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, provider.ErrNoProviderConfigured):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	case isQuotaExceededError(err):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "quota_exceeded"})
	case isRequestError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "chat request failed"})
	}
}

func errorMessage(err error) string {
	if err == nil {
		return "chat request failed"
	}
	if isRequestError(err) || errors.Is(err, ErrConversationBusy) ||
		errors.Is(err, ErrNoActiveGeneration) ||
		errors.Is(err, ErrNoActiveStream) ||
		errors.Is(err, ErrInvalidRetryAction) ||
		errors.Is(err, ErrInvalidRegenerateAction) ||
		errors.Is(err, ErrInvalidUserEdit) ||
		errors.Is(err, provider.ErrNoProviderConfigured) ||
		isQuotaExceededError(err) ||
		errors.Is(err, gorm.ErrRecordNotFound) {
		return err.Error()
	}
	return "chat request failed"
}
