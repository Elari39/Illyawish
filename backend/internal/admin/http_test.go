package admin

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/attachment"
	"backend/internal/audit"
	"backend/internal/config"
	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

func TestListAuditLogsRejectsInvalidLimitQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs?limit=oops", nil)

	NewHandler(NewService(nil, nil)).ListAuditLogs(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}
}

func TestPurgeAttachmentsRejectsMissingUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newAdminTestDB(t)
	attachmentService, err := attachment.NewService(db, &config.Config{UploadDir: t.TempDir()})
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	service := NewService(db, audit.NewService(db), attachmentService)
	handler := NewHandler(service)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := bytes.NewBufferString(`{"scope":"user"}`)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/attachments/purge", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	setAdminActor(ctx, createAdminActor(t, db))

	handler.PurgeAttachments(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}
}

func TestPurgeAttachmentsReturnsNotFoundForUnknownUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newAdminTestDB(t)
	attachmentService, err := attachment.NewService(db, &config.Config{UploadDir: t.TempDir()})
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	service := NewService(db, audit.NewService(db), attachmentService)
	handler := NewHandler(service)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := bytes.NewBufferString(`{"scope":"user","userId":999}`)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/attachments/purge", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	setAdminActor(ctx, createAdminActor(t, db))

	handler.PurgeAttachments(ctx)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
	}
}

func TestPurgeAttachmentsDeletesAllAndWritesAuditLog(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newAdminTestDB(t)
	attachmentService, err := attachment.NewService(db, &config.Config{UploadDir: t.TempDir()})
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	service := NewService(db, audit.NewService(db), attachmentService)
	handler := NewHandler(service)
	adminUser := createAdminActor(t, db)

	attachment := &models.StoredAttachment{
		ID:            "att-all",
		UserID:        adminUser.ID,
		Name:          "brief.txt",
		MIMEType:      "text/plain",
		Size:          5,
		StorageKey:    "att-all.txt",
		ExtractedText: "brief",
	}
	if err := db.Create(attachment).Error; err != nil {
		t.Fatalf("create attachment: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := bytes.NewBufferString(`{"scope":"all"}`)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/attachments/purge", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	setAdminActor(ctx, adminUser)

	handler.PurgeAttachments(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	var response struct {
		DeletedCount int `json:"deletedCount"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.DeletedCount != 1 {
		t.Fatalf("expected deletedCount 1, got %d", response.DeletedCount)
	}

	logs, err := service.ListAuditLogs(audit.ListParams{Limit: 20})
	if err != nil {
		t.Fatalf("ListAuditLogs() error = %v", err)
	}
	if len(logs.Logs) == 0 {
		t.Fatal("expected attachment purge audit log")
	}
	if logs.Logs[0].Action != "admin.attachments_deleted_all" {
		t.Fatalf("expected audit action admin.attachments_deleted_all, got %s", logs.Logs[0].Action)
	}
}

func setAdminActor(ctx *gin.Context, user *models.User) {
	ctx.Set("current_user", user)
}
