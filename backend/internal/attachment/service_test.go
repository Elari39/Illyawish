package attachment

import (
	"bytes"
	"mime/multipart"
	"path/filepath"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSaveUploadRejectsNonImages(t *testing.T) {
	service, user := newAttachmentTestService(t)

	fileHeader := buildMultipartFileHeader(t, "notes.txt", "plain text")
	if _, err := service.SaveUpload(user.ID, fileHeader); err == nil {
		t.Fatal("expected non-image upload to be rejected")
	}
}

func TestValidateForUserReturnsCanonicalAttachment(t *testing.T) {
	service, user := newAttachmentTestService(t)

	fileHeader := buildMultipartFileHeader(t, "pixel.png", pngFixtureBytes())
	attachment, err := service.SaveUpload(user.ID, fileHeader)
	if err != nil {
		t.Fatalf("SaveUpload() error = %v", err)
	}

	normalized, err := service.ValidateForUser(user.ID, []models.Attachment{{
		ID:   attachment.ID,
		Name: "wrong-name",
		URL:  "bad-url",
	}})
	if err != nil {
		t.Fatalf("ValidateForUser() error = %v", err)
	}

	if len(normalized) != 1 {
		t.Fatalf("expected 1 normalized attachment, got %d", len(normalized))
	}
	if normalized[0].URL != AttachmentURL(attachment.ID) {
		t.Fatalf("expected canonical attachment URL, got %q", normalized[0].URL)
	}
}

func TestCleanupUnreferencedDeletesFileAndMetadata(t *testing.T) {
	service, user := newAttachmentTestService(t)

	fileHeader := buildMultipartFileHeader(t, "pixel.png", pngFixtureBytes())
	attachment, err := service.SaveUpload(user.ID, fileHeader)
	if err != nil {
		t.Fatalf("SaveUpload() error = %v", err)
	}

	if err := service.CleanupUnreferenced([]models.Attachment{*attachment}); err != nil {
		t.Fatalf("CleanupUnreferenced() error = %v", err)
	}

	var count int64
	if err := service.db.Model(&models.StoredAttachment{}).Where("id = ?", attachment.ID).Count(&count).Error; err != nil {
		t.Fatalf("count metadata: %v", err)
	}
	if count != 0 {
		t.Fatal("expected attachment metadata to be deleted")
	}
}

func newAttachmentTestService(t *testing.T) (*Service, models.User) {
	t.Helper()

	tmpDir := t.TempDir()
	dsn := "file:attachment-test-" + time.Now().Format("150405.000000000") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.StoredAttachment{}, &models.Message{}); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	user := models.User{
		Username:     "tester",
		PasswordHash: "hash",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	service, err := NewService(db, &config.Config{UploadDir: filepath.Join(tmpDir, "uploads")})
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	return service, user
}

func buildMultipartFileHeader(t *testing.T, filename string, payload any) *multipart.FileHeader {
	t.Helper()

	var content []byte
	switch value := payload.(type) {
	case string:
		content = []byte(value)
	case []byte:
		content = value
	default:
		t.Fatalf("unsupported multipart payload type %T", payload)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write form payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	reader := multipart.NewReader(bytes.NewReader(body.Bytes()), writer.Boundary())
	form, err := reader.ReadForm(int64(len(body.Bytes())))
	if err != nil {
		t.Fatalf("ReadForm() error = %v", err)
	}
	t.Cleanup(func() {
		_ = form.RemoveAll()
	})

	return form.File["file"][0]
}

func pngFixtureBytes() []byte {
	return []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
		0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
		0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
		0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92,
		0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
		0x44, 0xae, 0x42, 0x60, 0x82,
	}
}
