package admin

import (
	"errors"

	"backend/internal/audit"

	"gorm.io/gorm"
)

var (
	ErrCannotDisableSelf = errors.New("cannot disable your own account")
	ErrCannotDemoteSelf  = errors.New("cannot change your own admin role")
	ErrLastAdminRemoval  = errors.New("workspace must keep at least one admin")
	ErrUserNotFound      = errors.New("user not found")
)

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
