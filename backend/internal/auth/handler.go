package auth

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"backend/internal/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Handler struct {
	db           *gorm.DB
	loginLimiter *loginRateLimiter
	audit        auditRecorder
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type bootstrapRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type auditRecorder interface {
	Record(actor *models.User, action string, targetType string, targetID string, targetName string, summary string) error
}

func NewHandler(db *gorm.DB, auditServices ...auditRecorder) *Handler {
	handler := &Handler{
		db:           db,
		loginLimiter: newLoginRateLimiter(),
	}
	if len(auditServices) > 0 {
		handler.audit = auditServices[0]
	}
	return handler
}

func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid login payload", "code": codeInvalidPayload})
		return
	}

	username, password, err := sanitizeCredentials(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": codeInvalidPayload})
		return
	}

	limiterKey := loginAttemptKey(c.ClientIP(), username)
	if retryAfter, blocked := h.loginLimiter.Allow(limiterKey); blocked {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":      "too many login attempts, please try again later",
			"retryAfter": retryAfter,
			"code":       codeRateLimited,
		})
		return
	}

	var user models.User
	if err := h.db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			h.recordLoginFailure(limiterKey, username)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password", "code": codeUnauthorized})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query user"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		h.recordLoginFailure(limiterKey, username)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password", "code": codeUnauthorized})
		return
	}
	if user.Status != models.UserStatusActive {
		h.recordLoginFailure(limiterKey, username)
		c.JSON(http.StatusForbidden, gin.H{"error": "account is disabled", "code": codeAccountDisabled})
		return
	}

	h.loginLimiter.Reset(limiterKey)
	if err := h.markLoginSuccess(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update last login"})
		return
	}
	if err := persistSessionUser(c, &user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist session"})
		return
	}

	h.recordAudit(
		&user,
		"auth.login_succeeded",
		"user",
		strconv.FormatUint(uint64(user.ID), 10),
		user.Username,
		fmt.Sprintf("User %s signed in", user.Username),
	)
	c.JSON(http.StatusOK, toUserResponse(&user))
}

func (h *Handler) BootstrapStatus(c *gin.Context) {
	required, err := bootstrapRequired(h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to inspect bootstrap status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"required": required})
}

func (h *Handler) Bootstrap(c *gin.Context) {
	var req bootstrapRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bootstrap payload", "code": codeInvalidPayload})
		return
	}

	username, password, err := sanitizeCredentials(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": codeInvalidPayload})
		return
	}

	user, err := createFirstUser(h.db, username, password)
	if err != nil {
		if errors.Is(err, errBootstrapAlreadyComplete) {
			c.JSON(http.StatusConflict, gin.H{"error": "bootstrap has already been completed"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create bootstrap user"})
		return
	}

	if err := h.markLoginSuccess(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update last login"})
		return
	}
	if err := persistSessionUser(c, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist session"})
		return
	}

	h.recordAudit(
		user,
		"auth.bootstrap_completed",
		"user",
		strconv.FormatUint(uint64(user.ID), 10),
		user.Username,
		"Created initial administrator",
	)
	c.JSON(http.StatusCreated, toUserResponse(user))
}

func (h *Handler) Logout(c *gin.Context) {
	clearSession(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) ChangePassword(c *gin.Context) {
	user := CurrentUser(c)

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid change password payload", "code": codeInvalidPayload})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(strings.TrimSpace(req.CurrentPassword))); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "current password is incorrect", "code": codeInvalidPayload})
		return
	}

	_, newPassword, err := sanitizeCredentials(user.Username, req.NewPassword)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": codeInvalidPayload})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	user.PasswordHash = string(hash)
	user.SessionVersion += 1
	if err := h.db.Model(user).Updates(map[string]any{
		"password_hash":   user.PasswordHash,
		"session_version": user.SessionVersion,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}
	if err := persistSessionUser(c, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist session"})
		return
	}

	h.recordAudit(
		user,
		"auth.password_changed",
		"user",
		strconv.FormatUint(uint64(user.ID), 10),
		user.Username,
		"Changed own password",
	)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) LogoutAll(c *gin.Context) {
	user := CurrentUser(c)
	user.SessionVersion += 1
	if err := h.db.Model(user).Update("session_version", user.SessionVersion).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke sessions"})
		return
	}

	h.recordAudit(
		user,
		"auth.logout_all",
		"user",
		strconv.FormatUint(uint64(user.ID), 10),
		user.Username,
		"Revoked all sessions",
	)
	clearSession(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) Me(c *gin.Context) {
	user := CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "code": codeUnauthorized})
		return
	}

	c.JSON(http.StatusOK, toUserResponse(user))
}

func (h *Handler) recordAudit(actor *models.User, action string, targetType string, targetID string, targetName string, summary string) {
	if h.audit == nil {
		return
	}
	_ = h.audit.Record(actor, action, targetType, targetID, targetName, summary)
}

func (h *Handler) recordLoginFailure(limiterKey string, username string) {
	h.loginLimiter.RecordFailure(limiterKey)
	h.recordAudit(nil, "auth.login_failed", "user", username, username, fmt.Sprintf("Login failed for %s", username))
}

func (h *Handler) markLoginSuccess(user *models.User) error {
	now := time.Now()
	if err := h.db.Model(user).Update("last_login_at", now).Error; err != nil {
		return fmt.Errorf("update last login: %w", err)
	}
	user.LastLoginAt = &now
	return nil
}
