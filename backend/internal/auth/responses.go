package auth

import (
	"strings"
	"time"

	"backend/internal/models"
)

const (
	contextKeyUser      = "current_user"
	codeUnauthorized    = "unauthorized"
	codeSessionExpired  = "session_expired"
	codeSessionRevoked  = "session_revoked"
	codeAccountDisabled = "account_disabled"
	codeRateLimited     = "rate_limited"
	codeInvalidPayload  = "validation_failed"
	codeForbidden       = "insufficient_permissions"
)

type userResponse struct {
	ID          uint    `json:"id"`
	Username    string  `json:"username"`
	Role        string  `json:"role"`
	Status      string  `json:"status"`
	LastLoginAt *string `json:"lastLoginAt"`
}

func toUserResponse(user *models.User) userResponse {
	var lastLoginAt *string
	if user.LastLoginAt != nil {
		value := user.LastLoginAt.UTC().Format(time.RFC3339)
		lastLoginAt = &value
	}

	return userResponse{
		ID:          user.ID,
		Username:    user.Username,
		Role:        strings.TrimSpace(user.Role),
		Status:      strings.TrimSpace(user.Status),
		LastLoginAt: lastLoginAt,
	}
}
