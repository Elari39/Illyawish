package admin

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
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

type UsageStatsDTO struct {
	TotalUsers                 int64              `json:"totalUsers"`
	ActiveUsers                int64              `json:"activeUsers"`
	RecentUsers                int64              `json:"recentUsers"`
	TotalConversations         int64              `json:"totalConversations"`
	TotalMessages              int64              `json:"totalMessages"`
	TotalAttachments           int64              `json:"totalAttachments"`
	ConfiguredProviderPresets  int64              `json:"configuredProviderPresets"`
	ActiveProviderPresets      int64              `json:"activeProviderPresets"`
	ActiveProviderDistribution []ProviderUsageDTO `json:"activeProviderDistribution"`
}

type ProviderUsageDTO struct {
	Name      string `json:"name"`
	BaseURL   string `json:"baseURL"`
	UserCount int64  `json:"userCount"`
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
	params, err := auditListParams(
		c.Query("actor"),
		c.Query("action"),
		c.Query("targetType"),
		c.Query("dateFrom"),
		c.Query("dateTo"),
		limit,
		offset,
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid audit filter", "code": "validation_failed"})
		return
	}

	result, err := h.service.ListAuditLogs(params)
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

func (h *Handler) GetUsageStats(c *gin.Context) {
	stats, err := h.service.GetUsageStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load usage stats"})
		return
	}
	c.JSON(http.StatusOK, toUsageStatsDTO(stats))
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

func auditListParams(actor string, action string, targetType string, dateFrom string, dateTo string, limit int, offset int) (audit.ListParams, error) {
	parsedDateFrom, err := parseAuditDate(dateFrom, false)
	if err != nil {
		return audit.ListParams{}, err
	}
	parsedDateTo, err := parseAuditDate(dateTo, true)
	if err != nil {
		return audit.ListParams{}, err
	}

	return audit.ListParams{
		Actor:      actor,
		Action:     action,
		TargetType: targetType,
		DateFrom:   parsedDateFrom,
		DateTo:     parsedDateTo,
		Limit:      limit,
		Offset:     offset,
	}, nil
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

func toUsageStatsDTO(stats *UsageStats) UsageStatsDTO {
	distribution := make([]ProviderUsageDTO, 0, len(stats.ActiveProviderDistribution))
	for _, item := range stats.ActiveProviderDistribution {
		distribution = append(distribution, ProviderUsageDTO{
			Name:      item.Name,
			BaseURL:   item.BaseURL,
			UserCount: item.UserCount,
		})
	}

	return UsageStatsDTO{
		TotalUsers:                 stats.TotalUsers,
		ActiveUsers:                stats.ActiveUsers,
		RecentUsers:                stats.RecentUsers,
		TotalConversations:         stats.TotalConversations,
		TotalMessages:              stats.TotalMessages,
		TotalAttachments:           stats.TotalAttachments,
		ConfiguredProviderPresets:  stats.ConfiguredProviderPresets,
		ActiveProviderPresets:      stats.ActiveProviderPresets,
		ActiveProviderDistribution: distribution,
	}
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func parseAuditDate(raw string, inclusiveEndOfDay bool) (*time.Time, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, nil
	}

	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return &parsed, nil
	}

	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, err
	}
	if inclusiveEndOfDay {
		parsed = parsed.Add(24 * time.Hour)
	}
	return &parsed, nil
}
