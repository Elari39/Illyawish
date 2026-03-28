package auth

import (
	"net/http"
	"strings"

	"backend/internal/models"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func RequireAuth(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		session := sessions.Default(c)
		userIDValue := session.Get(sessionKeyUserID)
		if userIDValue == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "code": codeUnauthorized})
			return
		}

		userID, ok := uintFromSessionValue(userIDValue)
		if !ok {
			clearSession(c)
			abortSessionError(c, "session expired", codeSessionExpired)
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			clearSession(c)
			abortSessionError(c, "session expired", codeSessionExpired)
			return
		}
		if user.Status != models.UserStatusActive {
			clearSession(c)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "account is disabled", "code": codeAccountDisabled})
			return
		}

		sessionVersion, ok := uintFromSessionValue(session.Get(sessionKeyVersion))
		if !ok {
			clearSession(c)
			abortSessionError(c, "session expired", codeSessionExpired)
			return
		}
		if sessionVersion != user.SessionVersion {
			clearSession(c)
			abortSessionError(c, "session revoked", codeSessionRevoked)
			return
		}

		c.Set(contextKeyUser, &user)
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := map[string]struct{}{}
	for _, role := range roles {
		allowed[strings.TrimSpace(role)] = struct{}{}
	}

	return func(c *gin.Context) {
		user := CurrentUser(c)
		if user == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "code": codeUnauthorized})
			return
		}
		if _, ok := allowed[user.Role]; !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions", "code": codeForbidden})
			return
		}
		c.Next()
	}
}

func CurrentUser(c *gin.Context) *models.User {
	value, exists := c.Get(contextKeyUser)
	if !exists {
		return nil
	}

	user, _ := value.(*models.User)
	return user
}
