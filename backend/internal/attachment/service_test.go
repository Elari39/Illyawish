package attachment

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/llm"
	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSaveUploadRejectsUnsupportedFiles(t *testing.T) {
	service, user := newAttachmentTestService(t)

	fileHeader := buildMultipartFileHeader(t, "notes.docx", "not supported")
	if _, err := service.SaveUpload(user.ID, fileHeader); err == nil {
		t.Fatal("expected unsupported upload to be rejected")
	}
}

func TestSaveUploadAcceptsSupportedAttachments(t *testing.T) {
	service, user := newAttachmentTestService(t)

	testCases := []struct {
		name         string
		filename     string
		payload      any
		wantMIMEType string
	}{
		{
			name:         "image",
			filename:     "pixel.png",
			payload:      pngFixtureBytes(),
			wantMIMEType: "image/png",
		},
		{
			name:         "text",
			filename:     "notes.txt",
			payload:      "plain text",
			wantMIMEType: mimeTypePlain,
		},
		{
			name:         "markdown",
			filename:     "notes.md",
			payload:      "# Heading\n\nParagraph",
			wantMIMEType: mimeTypeMarkdown,
		},
		{
			name:         "pdf",
			filename:     "notes.pdf",
			payload:      pdfFixtureBytes("Hello PDF"),
			wantMIMEType: mimeTypePDF,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fileHeader := buildMultipartFileHeader(t, testCase.filename, testCase.payload)
			attachment, err := service.SaveUpload(user.ID, fileHeader)
			if err != nil {
				t.Fatalf("SaveUpload() error = %v", err)
			}

			if attachment.MIMEType != testCase.wantMIMEType {
				t.Fatalf("expected MIME type %q, got %q", testCase.wantMIMEType, attachment.MIMEType)
			}
		})
	}
}

func TestSaveUploadRejectsInvalidPDF(t *testing.T) {
	service, user := newAttachmentTestService(t)

	fileHeader := buildMultipartFileHeader(t, "notes.pdf", "%PDF-not-a-real-pdf")
	if _, err := service.SaveUpload(user.ID, fileHeader); err == nil {
		t.Fatal("expected invalid PDF to be rejected")
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

func TestValidateForUserRejectsTooManyAttachments(t *testing.T) {
	service, user := newAttachmentTestService(t)

	attachments := make([]models.Attachment, maxAttachments+1)
	for index := range attachments {
		attachments[index] = models.Attachment{ID: fmt.Sprintf("attachment-%d", index)}
	}

	_, err := service.ValidateForUser(user.ID, attachments)
	if err == nil {
		t.Fatal("expected too many attachments error")
	}
	if !strings.Contains(err.Error(), "attachments") {
		t.Fatalf("expected attachments error, got %v", err)
	}
}

func TestBuildModelAttachmentsBuildsImageAndTextPayloads(t *testing.T) {
	service, user := newAttachmentTestService(t)

	imageAttachment, err := service.SaveUpload(
		user.ID,
		buildMultipartFileHeader(t, "pixel.png", pngFixtureBytes()),
	)
	if err != nil {
		t.Fatalf("save image upload: %v", err)
	}

	textAttachment, err := service.SaveUpload(
		user.ID,
		buildMultipartFileHeader(t, "notes.txt", "hello text attachment"),
	)
	if err != nil {
		t.Fatalf("save text upload: %v", err)
	}

	pdfAttachment, err := service.SaveUpload(
		user.ID,
		buildMultipartFileHeader(t, "notes.pdf", pdfFixtureBytes("Hello PDF")),
	)
	if err != nil {
		t.Fatalf("save pdf upload: %v", err)
	}

	modelAttachments, err := service.BuildModelAttachments([]models.Attachment{
		*imageAttachment,
		*textAttachment,
		*pdfAttachment,
	})
	if err != nil {
		t.Fatalf("BuildModelAttachments() error = %v", err)
	}

	if len(modelAttachments) != 3 {
		t.Fatalf("expected 3 model attachments, got %d", len(modelAttachments))
	}
	if modelAttachments[0].Kind != llm.AttachmentKindImage {
		t.Fatalf("expected image attachment kind, got %q", modelAttachments[0].Kind)
	}
	if !strings.HasPrefix(modelAttachments[0].URL, "data:image/png;base64,") {
		t.Fatalf("expected image data URL, got %q", modelAttachments[0].URL)
	}
	if modelAttachments[1].Kind != llm.AttachmentKindText || modelAttachments[1].Text != "hello text attachment" {
		t.Fatalf("unexpected text attachment payload: %#v", modelAttachments[1])
	}
	if modelAttachments[2].Kind != llm.AttachmentKindText ||
		!strings.Contains(strings.ReplaceAll(modelAttachments[2].Text, " ", ""), "HelloPDF") {
		t.Fatalf("unexpected pdf attachment payload: %#v", modelAttachments[2])
	}
}

func TestBuildModelAttachmentsTruncatesLongText(t *testing.T) {
	service, user := newAttachmentTestService(t)

	payload := strings.Repeat("a", maxAttachmentTextChars+50)
	attachment, err := service.SaveUpload(
		user.ID,
		buildMultipartFileHeader(t, "notes.txt", payload),
	)
	if err != nil {
		t.Fatalf("save upload: %v", err)
	}

	modelAttachments, err := service.BuildModelAttachments([]models.Attachment{*attachment})
	if err != nil {
		t.Fatalf("BuildModelAttachments() error = %v", err)
	}

	if len(modelAttachments) != 1 {
		t.Fatalf("expected 1 model attachment, got %d", len(modelAttachments))
	}
	if !strings.Contains(modelAttachments[0].Text, "Attachment text truncated after") {
		t.Fatalf("expected truncation message, got %q", modelAttachments[0].Text)
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

func TestCleanupUnreferencedKeepsSharedAttachmentMetadata(t *testing.T) {
	service, user := newAttachmentTestService(t)

	fileHeader := buildMultipartFileHeader(t, "pixel.png", pngFixtureBytes())
	attachment, err := service.SaveUpload(user.ID, fileHeader)
	if err != nil {
		t.Fatalf("SaveUpload() error = %v", err)
	}

	message := models.Message{
		ConversationID: 1,
		Role:           models.RoleUser,
		Content:        "hello",
		LegacyAttachments: []models.Attachment{
			*attachment,
		},
		Status: models.MessageStatusCompleted,
	}
	if err := service.db.Create(&message).Error; err != nil {
		t.Fatalf("create message: %v", err)
	}
	if err := service.db.Create(&models.MessageAttachment{
		MessageID:    message.ID,
		AttachmentID: attachment.ID,
		Position:     0,
	}).Error; err != nil {
		t.Fatalf("create message attachment: %v", err)
	}

	if err := service.CleanupUnreferenced([]models.Attachment{*attachment}); err != nil {
		t.Fatalf("CleanupUnreferenced() error = %v", err)
	}

	var count int64
	if err := service.db.Model(&models.StoredAttachment{}).Where("id = ?", attachment.ID).Count(&count).Error; err != nil {
		t.Fatalf("count metadata: %v", err)
	}
	if count != 1 {
		t.Fatal("expected referenced attachment metadata to be preserved")
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
	if err := db.AutoMigrate(&models.User{}, &models.StoredAttachment{}, &models.Message{}, &models.MessageAttachment{}); err != nil {
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

func pdfFixtureBytes(text string) []byte {
	var body bytes.Buffer
	offsets := []int{0}

	writeObject := func(index int, content string) {
		offsets = append(offsets, body.Len())
		fmt.Fprintf(&body, "%d 0 obj\n%s\nendobj\n", index, content)
	}

	escapedText := strings.NewReplacer(`\`, `\\`, "(", `\(`, ")", `\)`).Replace(text)
	stream := fmt.Sprintf("BT /F1 24 Tf 72 720 Td (%s) Tj ET", escapedText)

	body.WriteString("%PDF-1.4\n")
	writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObject(2, "<< /Type /Pages /Count 1 /Kids [3 0 R] >>")
	writeObject(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>")
	writeObject(4, fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream))
	writeObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

	xrefOffset := body.Len()
	fmt.Fprintf(&body, "xref\n0 %d\n", len(offsets))
	body.WriteString("0000000000 65535 f \n")
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&body, "%010d 00000 n \n", offset)
	}
	body.WriteString("trailer\n")
	fmt.Fprintf(&body, "<< /Size %d /Root 1 0 R >>\n", len(offsets))
	body.WriteString("startxref\n")
	fmt.Fprintf(&body, "%d\n", xrefOffset)
	body.WriteString("%%EOF\n")

	return body.Bytes()
}
