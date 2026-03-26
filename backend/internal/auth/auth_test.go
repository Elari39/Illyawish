package auth

import (
	"fmt"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestEnsureBootstrapUserCreatesFirstUser(t *testing.T) {
	db := newAuthTestDB(t)

	cfg := &config.Config{
		BootstrapUsername: "admin",
		BootstrapPassword: "super-secret",
	}

	if err := EnsureBootstrapUser(db, cfg); err != nil {
		t.Fatalf("EnsureBootstrapUser() error = %v", err)
	}

	required, err := bootstrapRequired(db)
	if err != nil {
		t.Fatalf("bootstrapRequired() error = %v", err)
	}
	if required {
		t.Fatal("expected bootstrap to be complete after creating first user")
	}
}

func TestEnsureBootstrapUserSkipsWhenUserAlreadyExists(t *testing.T) {
	db := newAuthTestDB(t)

	existing := models.User{
		Username:     "existing",
		PasswordHash: "hash",
	}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatalf("create existing user: %v", err)
	}

	cfg := &config.Config{
		BootstrapUsername: "admin",
		BootstrapPassword: "super-secret",
	}

	if err := EnsureBootstrapUser(db, cfg); err != nil {
		t.Fatalf("EnsureBootstrapUser() error = %v", err)
	}

	var count int64
	if err := db.Model(&models.User{}).Count(&count).Error; err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected existing user to be preserved without duplication, got %d users", count)
	}
}

func TestLoginRateLimiterBlocksAfterRepeatedFailures(t *testing.T) {
	limiter := newLoginRateLimiter()
	now := time.Now()
	limiter.now = func() time.Time {
		return now
	}

	key := loginAttemptKey("127.0.0.1", "admin")
	for attempt := 0; attempt < loginRateLimitMaxAttempts; attempt += 1 {
		limiter.RecordFailure(key)
	}

	retryAfter, blocked := limiter.Allow(key)
	if !blocked {
		t.Fatal("expected limiter to block after max failed attempts")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected positive retry-after, got %d", retryAfter)
	}

	limiter.Reset(key)
	if _, blocked := limiter.Allow(key); blocked {
		t.Fatal("expected limiter reset to clear block")
	}
}

func newAuthTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:auth-test-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	return db
}
