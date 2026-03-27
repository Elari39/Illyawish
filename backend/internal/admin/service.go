package admin

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"backend/internal/audit"
	"backend/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrCannotDisableSelf = errors.New("cannot disable your own account")
	ErrCannotDemoteSelf  = errors.New("cannot change your own admin role")
	ErrLastAdminRemoval  = errors.New("workspace must keep at least one admin")
	ErrUserNotFound      = errors.New("user not found")
)

type requestError struct {
	message string
	code    string
}

func (e requestError) Error() string {
	return e.message
}

func (e requestError) Code() string {
	return e.code
}

func IsRequestError(err error) bool {
	var target requestError
	return errors.As(err, &target)
}

func RequestErrorCode(err error) string {
	var target requestError
	if errors.As(err, &target) {
		return target.code
	}
	return ""
}

type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

type UserInput struct {
	Username                 string `json:"username"`
	Password                 string `json:"password"`
	Role                     string `json:"role"`
	Status                   string `json:"status"`
	MaxConversations         *int   `json:"maxConversations"`
	MaxAttachmentsPerMessage *int   `json:"maxAttachmentsPerMessage"`
	DailyMessageLimit        *int   `json:"dailyMessageLimit"`
}

type UserUpdateInput struct {
	Role                     string `json:"role"`
	Status                   string `json:"status"`
	MaxConversations         *int   `json:"maxConversations"`
	MaxAttachmentsPerMessage *int   `json:"maxAttachmentsPerMessage"`
	DailyMessageLimit        *int   `json:"dailyMessageLimit"`
}

type ResetPasswordInput struct {
	NewPassword string `json:"newPassword"`
}

type WorkspacePolicyInput struct {
	DefaultUserRole                 string `json:"defaultUserRole"`
	DefaultUserMaxConversations     *int   `json:"defaultUserMaxConversations"`
	DefaultUserMaxAttachmentsPerMsg *int   `json:"defaultUserMaxAttachmentsPerMessage"`
	DefaultUserDailyMessageLimit    *int   `json:"defaultUserDailyMessageLimit"`
}

type UsageStats struct {
	TotalUsers                 int64
	ActiveUsers                int64
	RecentUsers                int64
	TotalConversations         int64
	TotalMessages              int64
	TotalAttachments           int64
	ConfiguredProviderPresets  int64
	ActiveProviderPresets      int64
	ActiveProviderDistribution []ProviderUsage
}

type ProviderUsage struct {
	Name      string
	BaseURL   string
	UserCount int64
}

func NewService(db *gorm.DB, auditService *audit.Service) *Service {
	return &Service{
		db:    db,
		audit: auditService,
	}
}

func (s *Service) ListUsers() ([]models.User, error) {
	var users []models.User
	if err := s.db.Order("created_at asc").Find(&users).Error; err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	return users, nil
}

func (s *Service) CreateUser(actor *models.User, input UserInput) (*models.User, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return nil, requestError{message: "username is required", code: "validation_failed"}
	}
	if len(username) > 64 {
		return nil, requestError{message: "username must be 64 characters or fewer", code: "validation_failed"}
	}
	password := strings.TrimSpace(input.Password)
	if len(password) < 8 {
		return nil, requestError{message: "password must be at least 8 characters long", code: "validation_failed"}
	}

	policy, err := s.GetWorkspacePolicy()
	if err != nil {
		return nil, err
	}

	role, err := sanitizeRole(firstNonEmpty(strings.TrimSpace(input.Role), policy.DefaultUserRole))
	if err != nil {
		return nil, err
	}
	status, err := sanitizeStatus(firstNonEmpty(strings.TrimSpace(input.Status), models.UserStatusActive))
	if err != nil {
		return nil, err
	}

	maxConversations, err := sanitizeOptionalPositiveInt(coalesceIntPointer(input.MaxConversations, policy.DefaultUserMaxConversations), "max conversations")
	if err != nil {
		return nil, err
	}
	maxAttachments, err := sanitizeOptionalPositiveInt(coalesceIntPointer(input.MaxAttachmentsPerMessage, policy.DefaultUserMaxAttachmentsPerMsg), "max attachments per message")
	if err != nil {
		return nil, err
	}
	dailyMessageLimit, err := sanitizeOptionalPositiveInt(coalesceIntPointer(input.DailyMessageLimit, policy.DefaultUserDailyMessageLimit), "daily message limit")
	if err != nil {
		return nil, err
	}
	if err := s.ensureUsernameAvailable(username); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash user password: %w", err)
	}

	user := &models.User{
		Username:                 username,
		PasswordHash:             string(hash),
		Role:                     role,
		Status:                   status,
		SessionVersion:           1,
		MaxConversations:         maxConversations,
		MaxAttachmentsPerMessage: maxAttachments,
		DailyMessageLimit:        dailyMessageLimit,
	}
	if err := s.db.Create(user).Error; err != nil {
		if isDuplicateUsernameError(err) {
			return nil, requestError{message: "username already exists", code: "validation_failed"}
		}
		return nil, fmt.Errorf("create user: %w", err)
	}

	s.recordAudit(actor, "admin.user_created", user, fmt.Sprintf("Created user %s", user.Username))
	return user, nil
}

func (s *Service) UpdateUser(actor *models.User, userID uint, input UserUpdateInput) (*models.User, error) {
	user, err := s.getUser(userID)
	if err != nil {
		return nil, err
	}

	role, err := sanitizeRole(strings.TrimSpace(input.Role))
	if err != nil {
		return nil, err
	}
	status, err := sanitizeStatus(strings.TrimSpace(input.Status))
	if err != nil {
		return nil, err
	}
	maxConversations, err := sanitizeOptionalPositiveInt(input.MaxConversations, "max conversations")
	if err != nil {
		return nil, err
	}
	maxAttachments, err := sanitizeOptionalPositiveInt(input.MaxAttachmentsPerMessage, "max attachments per message")
	if err != nil {
		return nil, err
	}
	dailyMessageLimit, err := sanitizeOptionalPositiveInt(input.DailyMessageLimit, "daily message limit")
	if err != nil {
		return nil, err
	}

	if actor != nil && actor.ID == user.ID {
		if status == models.UserStatusDisabled {
			return nil, ErrCannotDisableSelf
		}
		if role != models.UserRoleAdmin {
			return nil, ErrCannotDemoteSelf
		}
	}
	if (user.Role == models.UserRoleAdmin && role != models.UserRoleAdmin) ||
		(user.Role == models.UserRoleAdmin && status != models.UserStatusActive) {
		ok, err := s.hasAnotherActiveAdmin(user.ID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrLastAdminRemoval
		}
	}

	user.Role = role
	user.Status = status
	user.MaxConversations = maxConversations
	user.MaxAttachmentsPerMessage = maxAttachments
	user.DailyMessageLimit = dailyMessageLimit
	if user.Status != models.UserStatusActive {
		user.SessionVersion += 1
	}
	if err := s.db.Model(user).Updates(map[string]any{
		"role":                        user.Role,
		"status":                      user.Status,
		"max_conversations":           user.MaxConversations,
		"max_attachments_per_message": user.MaxAttachmentsPerMessage,
		"daily_message_limit":         user.DailyMessageLimit,
		"session_version":             user.SessionVersion,
	}).Error; err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}

	s.recordAudit(actor, "admin.user_updated", user, fmt.Sprintf("Updated user %s", user.Username))
	return user, nil
}

func (s *Service) ResetPassword(actor *models.User, userID uint, input ResetPasswordInput) (*models.User, error) {
	user, err := s.getUser(userID)
	if err != nil {
		return nil, err
	}

	password := strings.TrimSpace(input.NewPassword)
	if len(password) < 8 {
		return nil, requestError{message: "password must be at least 8 characters long", code: "validation_failed"}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash reset password: %w", err)
	}

	user.PasswordHash = string(hash)
	user.SessionVersion += 1
	if err := s.db.Model(user).Updates(map[string]any{
		"password_hash":   user.PasswordHash,
		"session_version": user.SessionVersion,
	}).Error; err != nil {
		return nil, fmt.Errorf("reset user password: %w", err)
	}

	s.recordAudit(actor, "admin.user_password_reset", user, fmt.Sprintf("Reset password for %s", user.Username))
	return user, nil
}

func (s *Service) GetWorkspacePolicy() (*models.WorkspacePolicy, error) {
	var policy models.WorkspacePolicy
	if err := s.db.First(&policy, 1).Error; err != nil {
		return nil, fmt.Errorf("load workspace policy: %w", err)
	}
	if strings.TrimSpace(policy.DefaultUserRole) == "" {
		policy.DefaultUserRole = models.UserRoleMember
	}
	return &policy, nil
}

func (s *Service) UpdateWorkspacePolicy(actor *models.User, input WorkspacePolicyInput) (*models.WorkspacePolicy, error) {
	policy, err := s.GetWorkspacePolicy()
	if err != nil {
		return nil, err
	}

	role, err := sanitizeRole(strings.TrimSpace(input.DefaultUserRole))
	if err != nil {
		return nil, err
	}
	maxConversations, err := sanitizeOptionalPositiveInt(input.DefaultUserMaxConversations, "default max conversations")
	if err != nil {
		return nil, err
	}
	maxAttachments, err := sanitizeOptionalPositiveInt(input.DefaultUserMaxAttachmentsPerMsg, "default max attachments per message")
	if err != nil {
		return nil, err
	}
	dailyMessageLimit, err := sanitizeOptionalPositiveInt(input.DefaultUserDailyMessageLimit, "default daily message limit")
	if err != nil {
		return nil, err
	}

	policy.DefaultUserRole = role
	policy.DefaultUserMaxConversations = maxConversations
	policy.DefaultUserMaxAttachmentsPerMsg = maxAttachments
	policy.DefaultUserDailyMessageLimit = dailyMessageLimit
	if err := s.db.Model(policy).Updates(map[string]any{
		"default_user_role":                    policy.DefaultUserRole,
		"default_user_max_conversations":       policy.DefaultUserMaxConversations,
		"default_user_max_attachments_per_msg": policy.DefaultUserMaxAttachmentsPerMsg,
		"default_user_daily_message_limit":     policy.DefaultUserDailyMessageLimit,
	}).Error; err != nil {
		return nil, fmt.Errorf("update workspace policy: %w", err)
	}

	if s.audit != nil {
		_ = s.audit.Record(actor, "admin.workspace_policy_updated", "workspace_policy", "1", "workspace", "Updated workspace defaults")
	}
	return policy, nil
}

func (s *Service) ListAuditLogs(params audit.ListParams) (*audit.ListResult, error) {
	if s.audit == nil {
		return &audit.ListResult{}, nil
	}
	return s.audit.List(params)
}

func (s *Service) GetUsageStats() (*UsageStats, error) {
	recentSince := time.Now().Add(-7 * 24 * time.Hour).UTC()
	stats := &UsageStats{}

	counters := []struct {
		model any
		dest  *int64
		query func(*gorm.DB) *gorm.DB
	}{
		{model: &models.User{}, dest: &stats.TotalUsers},
		{
			model: &models.User{},
			dest:  &stats.ActiveUsers,
			query: func(db *gorm.DB) *gorm.DB {
				return db.Where("status = ?", models.UserStatusActive)
			},
		},
		{
			model: &models.User{},
			dest:  &stats.RecentUsers,
			query: func(db *gorm.DB) *gorm.DB {
				return db.Where("last_login_at >= ?", recentSince)
			},
		},
		{model: &models.Conversation{}, dest: &stats.TotalConversations},
		{model: &models.Message{}, dest: &stats.TotalMessages},
		{model: &models.StoredAttachment{}, dest: &stats.TotalAttachments},
		{model: &models.LLMProviderPreset{}, dest: &stats.ConfiguredProviderPresets},
		{
			model: &models.LLMProviderPreset{},
			dest:  &stats.ActiveProviderPresets,
			query: func(db *gorm.DB) *gorm.DB {
				return db.Where("is_active = ?", true)
			},
		},
	}

	for _, counter := range counters {
		query := s.db.Model(counter.model)
		if counter.query != nil {
			query = counter.query(query)
		}
		if err := query.Count(counter.dest).Error; err != nil {
			return nil, fmt.Errorf("count usage stats: %w", err)
		}
	}

	if err := s.db.Model(&models.LLMProviderPreset{}).
		Select("name, base_url, count(*) as user_count").
		Where("is_active = ?", true).
		Group("name, base_url").
		Order("user_count desc, name asc, base_url asc").
		Scan(&stats.ActiveProviderDistribution).Error; err != nil {
		return nil, fmt.Errorf("list active provider distribution: %w", err)
	}

	return stats, nil
}

func (s *Service) ensureUsernameAvailable(username string) error {
	var count int64
	if err := s.db.Model(&models.User{}).
		Where("username = ?", username).
		Count(&count).Error; err != nil {
		return fmt.Errorf("check existing username: %w", err)
	}
	if count > 0 {
		return requestError{message: "username already exists", code: "validation_failed"}
	}
	return nil
}

func (s *Service) getUser(userID uint) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("load user: %w", err)
	}
	return &user, nil
}

func (s *Service) hasAnotherActiveAdmin(excludingUserID uint) (bool, error) {
	var count int64
	if err := s.db.Model(&models.User{}).
		Where("id <> ? AND role = ? AND status = ?", excludingUserID, models.UserRoleAdmin, models.UserStatusActive).
		Count(&count).Error; err != nil {
		return false, fmt.Errorf("count active admins: %w", err)
	}
	return count > 0, nil
}

func (s *Service) recordAudit(actor *models.User, action string, target *models.User, summary string) {
	if s.audit == nil {
		return
	}

	targetID := ""
	targetName := ""
	if target != nil {
		targetID = strconv.FormatUint(uint64(target.ID), 10)
		targetName = target.Username
	}
	_ = s.audit.Record(actor, action, "user", targetID, targetName, summary)
}

func sanitizeRole(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case models.UserRoleAdmin, models.UserRoleMember:
		return strings.TrimSpace(value), nil
	default:
		return "", requestError{message: "role must be admin or member", code: "validation_failed"}
	}
}

func sanitizeStatus(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case models.UserStatusActive, models.UserStatusDisabled:
		return strings.TrimSpace(value), nil
	default:
		return "", requestError{message: "status must be active or disabled", code: "validation_failed"}
	}
}

func sanitizeOptionalPositiveInt(value *int, label string) (*int, error) {
	if value == nil {
		return nil, nil
	}
	if *value <= 0 {
		return nil, requestError{message: fmt.Sprintf("%s must be greater than 0", label), code: "validation_failed"}
	}
	cloned := *value
	return &cloned, nil
}

func coalesceIntPointer(primary *int, fallback *int) *int {
	if primary != nil {
		return primary
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func isDuplicateUsernameError(err error) bool {
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}

	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "unique constraint failed") &&
		strings.Contains(message, "users.username")
}
