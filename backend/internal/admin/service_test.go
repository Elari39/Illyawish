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

func newAdminTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:admin-test-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.AuditLog{}, &models.WorkspacePolicy{}); err != nil {
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
