package auth

import (
	"net/http"
	"strconv"

	"backend/internal/models"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const (
	sessionKeyUserID  = "user_id"
	sessionKeyVersion = "session_version"
)

func persistSessionUser(c *gin.Context, user *models.User) error {
	session := sessions.Default(c)
	session.Set(sessionKeyUserID, strconv.FormatUint(uint64(user.ID), 10))
	session.Set(sessionKeyVersion, strconv.FormatUint(uint64(user.SessionVersion), 10))
	return session.Save()
}

func clearSession(c *gin.Context) {
	session := sessions.Default(c)
	session.Clear()
	_ = session.Save()
}

func uintFromSessionValue(value any) (uint, bool) {
	switch v := value.(type) {
	case string:
		parsed, err := strconv.ParseUint(v, 10, 64)
		if err != nil {
			return 0, false
		}
		return uint(parsed), true
	case uint:
		return v, true
	case int:
		return uint(v), true
	case int64:
		return uint(v), true
	case float64:
		return uint(v), true
	default:
		return 0, false
	}
}

func abortSessionError(c *gin.Context, message string, code string) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": message, "code": code})
}
