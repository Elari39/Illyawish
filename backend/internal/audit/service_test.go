package audit

import (
	"fmt"
	"testing"
	"time"

	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestServiceListAppliesActorTargetAndDateFilters(t *testing.T) {
	db := newAuditTestDB(t)
	service := NewService(db)

	logs := []models.AuditLog{
		{
			ActorUsername: "aria",
			Action:        "admin.user_updated",
			TargetType:    "user",
			TargetID:      "1",
			TargetName:    "aria",
			Summary:       "Updated user",
			CreatedAt:     time.Date(2026, 3, 20, 8, 0, 0, 0, time.UTC),
		},
		{
			ActorUsername: "elaina",
			Action:        "admin.workspace_policy_updated",
			TargetType:    "workspace_policy",
			TargetID:      "1",
			TargetName:    "workspace",
			Summary:       "Updated workspace policy",
			CreatedAt:     time.Date(2026, 3, 21, 9, 0, 0, 0, time.UTC),
		},
		{
			ActorUsername: "aria",
			Action:        "admin.user_password_reset",
			TargetType:    "user",
			TargetID:      "2",
			TargetName:    "miyu",
			Summary:       "Reset password",
			CreatedAt:     time.Date(2026, 3, 24, 10, 0, 0, 0, time.UTC),
		},
	}
	if err := db.Create(&logs).Error; err != nil {
		t.Fatalf("create audit logs: %v", err)
	}

	dateFrom := time.Date(2026, 3, 19, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2026, 3, 22, 0, 0, 0, 0, time.UTC)

	result, err := service.List(ListParams{
		Actor:      "ari",
		Action:     "admin.user_updated",
		TargetType: "user",
		DateFrom:   &dateFrom,
		DateTo:     &dateTo,
		Limit:      20,
	})
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if result.Total != 1 {
		t.Fatalf("expected filtered total 1, got %d", result.Total)
	}
	if len(result.Logs) != 1 {
		t.Fatalf("expected 1 filtered log, got %d", len(result.Logs))
	}
	if result.Logs[0].Action != "admin.user_updated" {
		t.Fatalf("expected admin.user_updated, got %s", result.Logs[0].Action)
	}
}

func newAuditTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:audit-test-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.AuditLog{}); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	return db
}
