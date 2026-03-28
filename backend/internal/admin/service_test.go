package admin

import (
	"fmt"
	"testing"
	"time"

	"backend/internal/audit"
	"backend/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestServiceCreateUpdateAndResetUser(t *testing.T) {
	db := newAdminTestDB(t)
	auditService := audit.NewService(db)
	service := NewService(db, auditService)

	adminUser := createAdminActor(t, db)

	created, err := service.CreateUser(adminUser, UserInput{
		Username:                 "member",
		Password:                 "super-secret",
		Role:                     models.UserRoleMember,
		Status:                   models.UserStatusActive,
		MaxConversations:         intPtr(3),
		MaxAttachmentsPerMessage: intPtr(2),
		DailyMessageLimit:        intPtr(5),
	})
	if err != nil {
		t.Fatalf("CreateUser() error = %v", err)
	}
	if created.Role != models.UserRoleMember {
		t.Fatalf("expected created user role member, got %s", created.Role)
	}

	updated, err := service.UpdateUser(adminUser, created.ID, UserUpdateInput{
		Role:                     models.UserRoleMember,
		Status:                   models.UserStatusDisabled,
		MaxConversations:         intPtr(4),
		MaxAttachmentsPerMessage: intPtr(1),
		DailyMessageLimit:        intPtr(6),
	})
	if err != nil {
		t.Fatalf("UpdateUser() error = %v", err)
	}
	if updated.Status != models.UserStatusDisabled {
		t.Fatalf("expected disabled user, got %s", updated.Status)
	}
	if updated.SessionVersion != 2 {
		t.Fatalf("expected session version to bump on disable, got %d", updated.SessionVersion)
	}

	reset, err := service.ResetPassword(adminUser, created.ID, ResetPasswordInput{
		NewPassword: "new-password",
	})
	if err != nil {
		t.Fatalf("ResetPassword() error = %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(reset.PasswordHash), []byte("new-password")); err != nil {
		t.Fatalf("expected password hash to match new password: %v", err)
	}

	logs, err := service.ListAuditLogs(audit.ListParams{Limit: 20})
	if err != nil {
		t.Fatalf("ListAuditLogs() error = %v", err)
	}
	if len(logs.Logs) < 3 {
		t.Fatalf("expected audit logs for create/update/reset, got %d", len(logs.Logs))
	}
}

func TestServicePreventsRemovingLastAdmin(t *testing.T) {
	db := newAdminTestDB(t)
	service := NewService(db, audit.NewService(db))
	adminUser := createAdminActor(t, db)

	_, err := service.UpdateUser(adminUser, adminUser.ID, UserUpdateInput{
		Role:                     models.UserRoleMember,
		Status:                   models.UserStatusActive,
		MaxConversations:         nil,
		MaxAttachmentsPerMessage: nil,
		DailyMessageLimit:        nil,
	})
	if err == nil {
		t.Fatal("expected last admin demotion to fail")
	}
}

func TestServiceCreateUserRejectsDuplicateUsername(t *testing.T) {
	db := newAdminTestDB(t)
	service := NewService(db, audit.NewService(db))
	adminUser := createAdminActor(t, db)

	if _, err := service.CreateUser(adminUser, UserInput{
		Username: "member",
		Password: "super-secret",
		Role:     models.UserRoleMember,
		Status:   models.UserStatusActive,
	}); err != nil {
		t.Fatalf("first CreateUser() error = %v", err)
	}

	_, err := service.CreateUser(adminUser, UserInput{
		Username: "member",
		Password: "another-secret",
		Role:     models.UserRoleMember,
		Status:   models.UserStatusActive,
	})
	if !IsRequestError(err) {
		t.Fatalf("expected request error for duplicate username, got %v", err)
	}
	if got := RequestErrorCode(err); got != "validation_failed" {
		t.Fatalf("expected validation_failed code, got %q", got)
	}
	if err.Error() != "username already exists" {
		t.Fatalf("expected duplicate username message, got %q", err.Error())
	}
}

func TestServiceGetUsageStatsAggregatesWorkspaceState(t *testing.T) {
	db := newAdminTestDB(t)
	service := NewService(db, audit.NewService(db))
	adminUser := createAdminActor(t, db)

	recentLogin := time.Now().Add(-48 * time.Hour).UTC()
	inactiveLogin := time.Now().Add(-15 * 24 * time.Hour).UTC()
	member := &models.User{
		Username:       "member",
		PasswordHash:   adminUser.PasswordHash,
		Role:           models.UserRoleMember,
		Status:         models.UserStatusActive,
		SessionVersion: 1,
		LastLoginAt:    &recentLogin,
	}
	disabled := &models.User{
		Username:       "disabled",
		PasswordHash:   adminUser.PasswordHash,
		Role:           models.UserRoleMember,
		Status:         models.UserStatusDisabled,
		SessionVersion: 1,
		LastLoginAt:    &inactiveLogin,
	}
	if err := db.Create(member).Error; err != nil {
		t.Fatalf("create member: %v", err)
	}
	if err := db.Create(disabled).Error; err != nil {
		t.Fatalf("create disabled user: %v", err)
	}

	conversation := &models.Conversation{
		UserID: member.ID,
		Title:  "Ops review",
		Model:  "gpt-4.1-mini",
	}
	if err := db.Create(conversation).Error; err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	message := &models.Message{
		ConversationID: conversation.ID,
		Role:           models.RoleUser,
		Content:        "Need a summary",
		Status:         models.MessageStatusCompleted,
	}
	if err := db.Create(message).Error; err != nil {
		t.Fatalf("create message: %v", err)
	}

	attachment := &models.StoredAttachment{
		ID:            "att-1",
		UserID:        member.ID,
		Name:          "brief.txt",
		MIMEType:      "text/plain",
		Size:          128,
		StorageKey:    "uploads/brief.txt",
		ExtractedText: "briefing",
	}
	if err := db.Create(attachment).Error; err != nil {
		t.Fatalf("create attachment: %v", err)
	}

	presets := []models.LLMProviderPreset{
		{
			UserID:          member.ID,
			Name:            "OpenAI",
			BaseURL:         "https://api.openai.com/v1",
			EncryptedAPIKey: "enc-1",
			APIKeyHint:      "sk-***1",
			Models:          []string{"gpt-4.1-mini"},
			DefaultModel:    "gpt-4.1-mini",
			IsActive:        true,
		},
		{
			UserID:          adminUser.ID,
			Name:            "OpenAI",
			BaseURL:         "https://api.openai.com/v1",
			EncryptedAPIKey: "enc-2",
			APIKeyHint:      "sk-***2",
			Models:          []string{"gpt-4.1"},
			DefaultModel:    "gpt-4.1",
			IsActive:        true,
		},
		{
			UserID:          disabled.ID,
			Name:            "Anthropic",
			BaseURL:         "https://api.anthropic.com",
			EncryptedAPIKey: "enc-3",
			APIKeyHint:      "sk-***3",
			Models:          []string{"claude-sonnet"},
			DefaultModel:    "claude-sonnet",
			IsActive:        false,
		},
	}
	if err := db.Create(&presets).Error; err != nil {
		t.Fatalf("create provider presets: %v", err)
	}

	stats, err := service.GetUsageStats()
	if err != nil {
		t.Fatalf("GetUsageStats() error = %v", err)
	}

	if stats.TotalUsers != 3 {
		t.Fatalf("expected 3 total users, got %d", stats.TotalUsers)
	}
	if stats.ActiveUsers != 2 {
		t.Fatalf("expected 2 active users, got %d", stats.ActiveUsers)
	}
	if stats.RecentUsers != 1 {
		t.Fatalf("expected 1 recent user, got %d", stats.RecentUsers)
	}
	if stats.TotalConversations != 1 {
		t.Fatalf("expected 1 conversation, got %d", stats.TotalConversations)
	}
	if stats.TotalMessages != 1 {
		t.Fatalf("expected 1 message, got %d", stats.TotalMessages)
	}
	if stats.TotalAttachments != 1 {
		t.Fatalf("expected 1 attachment, got %d", stats.TotalAttachments)
	}
	if stats.ConfiguredProviderPresets != 3 {
		t.Fatalf("expected 3 configured provider presets, got %d", stats.ConfiguredProviderPresets)
	}
	if stats.ActiveProviderPresets != 2 {
		t.Fatalf("expected 2 active provider presets, got %d", stats.ActiveProviderPresets)
	}
	if len(stats.ActiveProviderDistribution) != 1 {
		t.Fatalf("expected 1 active provider distribution entry, got %d", len(stats.ActiveProviderDistribution))
	}
	if stats.ActiveProviderDistribution[0].Name != "OpenAI" {
		t.Fatalf("expected OpenAI provider distribution, got %s", stats.ActiveProviderDistribution[0].Name)
	}
	if stats.ActiveProviderDistribution[0].UserCount != 2 {
		t.Fatalf("expected OpenAI distribution count 2, got %d", stats.ActiveProviderDistribution[0].UserCount)
	}
}

func TestAuditListParamsRejectsInvalidLimitAndOffset(t *testing.T) {
	_, err := auditListParams("", "", "", "", "", 0, 0)
	if err != nil {
		t.Fatalf("unexpected error for default pagination: %v", err)
	}

	_, err = auditListParams("", "", "", "", "", -1, 0)
	if err == nil {
		t.Fatal("expected negative limit to fail")
	}

	_, err = auditListParams("", "", "", "", "", 10, -1)
	if err == nil {
		t.Fatal("expected negative offset to fail")
	}
}

func newAdminTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:admin-test-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.AuditLog{},
		&models.WorkspacePolicy{},
		&models.Conversation{},
		&models.Message{},
		&models.StoredAttachment{},
		&models.LLMProviderPreset{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	if err := db.Create(&models.WorkspacePolicy{ID: 1, DefaultUserRole: models.UserRoleMember}).Error; err != nil {
		t.Fatalf("create workspace policy: %v", err)
	}
	return db
}

func createAdminActor(t *testing.T, db *gorm.DB) *models.User {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte("super-secret"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	user := &models.User{
		Username:       "admin",
		PasswordHash:   string(hash),
		Role:           models.UserRoleAdmin,
		Status:         models.UserStatusActive,
		SessionVersion: 1,
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create admin actor: %v", err)
	}
	return user
}

func intPtr(value int) *int {
	return &value
}
