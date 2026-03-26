package auth

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"backend/internal/models"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	sessionKeyUserID = "user_id"
	contextKeyUser   = "current_user"
)

type Handler struct {
	db           *gorm.DB
	loginLimiter *loginRateLimiter
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type bootstrapRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type userResponse struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{
		db:           db,
		loginLimiter: newLoginRateLimiter(),
	}
}

func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid login payload"})
		return
	}

	username, password, err := sanitizeCredentials(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	limiterKey := loginAttemptKey(c.ClientIP(), username)
	if retryAfter, blocked := h.loginLimiter.Allow(limiterKey); blocked {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":      "too many login attempts, please try again later",
			"retryAfter": retryAfter,
			"code":       "rate_limited",
		})
		return
	}

	var user models.User
	if err := h.db.Where("username = ?", username).First(&user).Error; err != nil {
		h.loginLimiter.RecordFailure(limiterKey)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query user"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		h.loginLimiter.RecordFailure(limiterKey)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	h.loginLimiter.Reset(limiterKey)
	if err := persistSessionUser(c, user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist session"})
		return
	}

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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bootstrap payload"})
		return
	}

	username, password, err := sanitizeCredentials(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	if err := persistSessionUser(c, user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist session"})
		return
	}

	c.JSON(http.StatusCreated, toUserResponse(user))
}

func (h *Handler) Logout(c *gin.Context) {
	session := sessions.Default(c)
	session.Clear()
	if err := session.Save(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) Me(c *gin.Context) {
	user := CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	c.JSON(http.StatusOK, toUserResponse(user))
}

func RequireAuth(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		session := sessions.Default(c)
		userIDValue := session.Get(sessionKeyUserID)
		if userIDValue == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "unauthorized",
				"code":  "unauthorized",
			})
			return
		}

		var userID uint
		switch v := userIDValue.(type) {
		case string:
			parsed, err := strconv.ParseUint(v, 10, 64)
			if err != nil {
				clearSession(c)
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "session expired",
					"code":  "session_expired",
				})
				return
			}
			userID = uint(parsed)
		case uint:
			userID = v
		case int:
			userID = uint(v)
		case int64:
			userID = uint(v)
		case float64:
			userID = uint(v)
		default:
			clearSession(c)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "session expired",
				"code":  "session_expired",
			})
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			clearSession(c)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "session expired",
				"code":  "session_expired",
			})
			return
		}

		c.Set(contextKeyUser, &user)
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

func toUserResponse(user *models.User) userResponse {
	return userResponse{
		ID:       user.ID,
		Username: user.Username,
	}
}

func persistSessionUser(c *gin.Context, userID uint) error {
	session := sessions.Default(c)
	session.Set(sessionKeyUserID, strconv.FormatUint(uint64(userID), 10))
	return session.Save()
}

func clearSession(c *gin.Context) {
	session := sessions.Default(c)
	session.Clear()
	_ = session.Save()
}

func sanitizeCredentials(username string, password string) (string, string, error) {
	normalizedUsername := strings.TrimSpace(username)
	if normalizedUsername == "" {
		return "", "", errors.New("username is required")
	}
	if len(normalizedUsername) > 64 {
		return "", "", errors.New("username must be 64 characters or fewer")
	}

	normalizedPassword := strings.TrimSpace(password)
	if normalizedPassword == "" {
		return "", "", errors.New("password is required")
	}
	if len(normalizedPassword) < 8 {
		return "", "", errors.New("password must be at least 8 characters long")
	}

	return normalizedUsername, normalizedPassword, nil
}
