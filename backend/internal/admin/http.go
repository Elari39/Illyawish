package admin

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"backend/internal/audit"
	"backend/internal/auth"
	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

type UserDTO struct {
	ID                       uint    `json:"id"`
	Username                 string  `json:"username"`
	Role                     string  `json:"role"`
	Status                   string  `json:"status"`
	LastLoginAt              *string `json:"lastLoginAt"`
	MaxConversations         *int    `json:"maxConversations"`
	MaxAttachmentsPerMessage *int    `json:"maxAttachmentsPerMessage"`
	DailyMessageLimit        *int    `json:"dailyMessageLimit"`
	CreatedAt                string  `json:"createdAt"`
	UpdatedAt                string  `json:"updatedAt"`
}

type AuditLogDTO struct {
	ID            uint   `json:"id"`
	ActorUsername string `json:"actorUsername"`
	Action        string `json:"action"`
	TargetType    string `json:"targetType"`
	TargetID      string `json:"targetId"`
	TargetName    string `json:"targetName"`
	Summary       string `json:"summary"`
	CreatedAt     string `json:"createdAt"`
}

type WorkspacePolicyDTO struct {
	DefaultUserRole                 string `json:"defaultUserRole"`
	DefaultUserMaxConversations     *int   `json:"defaultUserMaxConversations"`
	DefaultUserMaxAttachmentsPerMsg *int   `json:"defaultUserMaxAttachmentsPerMessage"`
	DefaultUserDailyMessageLimit    *int   `json:"defaultUserDailyMessageLimit"`
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) ListUsers(c *gin.Context) {
	users, err := h.service.ListUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}

	response := make([]UserDTO, 0, len(users))
	for _, user := range users {
		response = append(response, toUserDTO(&user))
	}
	c.JSON(http.StatusOK, gin.H{"users": response})
}

func (h *Handler) CreateUser(c *gin.Context) {
	actor := auth.CurrentUser(c)
	var req UserInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user payload", "code": "validation_failed"})
		return
	}

	user, err := h.service.CreateUser(actor, req)
	if err != nil {
		handleAdminError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": toUserDTO(user)})
}

func (h *Handler) UpdateUser(c *gin.Context) {
	actor := auth.CurrentUser(c)
	userID, err := userIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id", "code": "validation_failed"})
		return
	}

	var req UserUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user payload", "code": "validation_failed"})
		return
	}

	user, err := h.service.UpdateUser(actor, userID, req)
	if err != nil {
		handleAdminError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": toUserDTO(user)})
}

func (h *Handler) ResetPassword(c *gin.Context) {
	actor := auth.CurrentUser(c)
	userID, err := userIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id", "code": "validation_failed"})
		return
	}

	var req ResetPasswordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid password payload", "code": "validation_failed"})
		return
	}

	user, err := h.service.ResetPassword(actor, userID, req)
	if err != nil {
		handleAdminError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": toUserDTO(user)})
}

func (h *Handler) ListAuditLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	result, err := h.service.ListAuditLogs(auditListParams(c.Query("action"), limit, offset))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list audit logs"})
		return
	}

	logs := make([]AuditLogDTO, 0, len(result.Logs))
	for _, log := range result.Logs {
		logs = append(logs, toAuditLogDTO(&log))
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs, "total": result.Total})
}

func (h *Handler) GetWorkspacePolicy(c *gin.Context) {
	policy, err := h.service.GetWorkspacePolicy()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load workspace policy"})
		return
	}
	c.JSON(http.StatusOK, toWorkspacePolicyDTO(policy))
}

func (h *Handler) UpdateWorkspacePolicy(c *gin.Context) {
	actor := auth.CurrentUser(c)
	var req WorkspacePolicyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace policy payload", "code": "validation_failed"})
		return
	}

	policy, err := h.service.UpdateWorkspacePolicy(actor, req)
	if err != nil {
		handleAdminError(c, err)
		return
	}
	c.JSON(http.StatusOK, toWorkspacePolicyDTO(policy))
}

func handleAdminError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrUserNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
	case errors.Is(err, ErrCannotDisableSelf):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "validation_failed"})
	case errors.Is(err, ErrCannotDemoteSelf):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "validation_failed"})
	case errors.Is(err, ErrLastAdminRemoval):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "validation_failed"})
	case IsRequestError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": RequestErrorCode(err)})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "admin request failed"})
	}
}

func userIDParam(c *gin.Context) (uint, error) {
	rawID := c.Param("id")
	parsed, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(parsed), nil
}

func auditListParams(action string, limit int, offset int) audit.ListParams {
	return audit.ListParams{
		Action: action,
		Limit:  limit,
		Offset: offset,
	}
}

func toUserDTO(user *models.User) UserDTO {
	var lastLoginAt *string
	if user.LastLoginAt != nil {
		value := user.LastLoginAt.UTC().Format(time.RFC3339)
		lastLoginAt = &value
	}

	return UserDTO{
		ID:                       user.ID,
		Username:                 user.Username,
		Role:                     user.Role,
		Status:                   user.Status,
		LastLoginAt:              lastLoginAt,
		MaxConversations:         cloneInt(user.MaxConversations),
		MaxAttachmentsPerMessage: cloneInt(user.MaxAttachmentsPerMessage),
		DailyMessageLimit:        cloneInt(user.DailyMessageLimit),
		CreatedAt:                user.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:                user.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func toAuditLogDTO(log *models.AuditLog) AuditLogDTO {
	return AuditLogDTO{
		ID:            log.ID,
		ActorUsername: log.ActorUsername,
		Action:        log.Action,
		TargetType:    log.TargetType,
		TargetID:      log.TargetID,
		TargetName:    log.TargetName,
		Summary:       log.Summary,
		CreatedAt:     log.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func toWorkspacePolicyDTO(policy *models.WorkspacePolicy) WorkspacePolicyDTO {
	return WorkspacePolicyDTO{
		DefaultUserRole:                 policy.DefaultUserRole,
		DefaultUserMaxConversations:     cloneInt(policy.DefaultUserMaxConversations),
		DefaultUserMaxAttachmentsPerMsg: cloneInt(policy.DefaultUserMaxAttachmentsPerMsg),
		DefaultUserDailyMessageLimit:    cloneInt(policy.DefaultUserDailyMessageLimit),
	}
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
