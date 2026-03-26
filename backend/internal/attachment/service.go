package attachment

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"backend/internal/config"
	"backend/internal/llm"
	"backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	maxAttachmentBytes = 6 * 1024 * 1024
	maxAttachments     = 4
)

var ErrAttachmentNotFound = errors.New("attachment not found")

type requestError struct {
	message string
}

func (e requestError) Error() string {
	return e.message
}

func IsRequestError(err error) bool {
	var target requestError
	return errors.As(err, &target)
}

type Service struct {
	db        *gorm.DB
	uploadDir string
}

func NewService(db *gorm.DB, cfg *config.Config) (*Service, error) {
	uploadDir := strings.TrimSpace(cfg.UploadDir)
	if uploadDir == "" {
		uploadDir = "./data/uploads"
	}
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	return &Service{
		db:        db,
		uploadDir: uploadDir,
	}, nil
}

func (s *Service) SaveUpload(userID uint, fileHeader *multipart.FileHeader) (*models.Attachment, error) {
	if fileHeader == nil {
		return nil, requestError{message: "attachment file is required"}
	}
	if fileHeader.Size <= 0 {
		return nil, requestError{message: "attachment file is empty"}
	}
	if fileHeader.Size > maxAttachmentBytes {
		return nil, requestError{message: fmt.Sprintf("image %q is too large", fileHeader.Filename)}
	}

	file, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("open upload: %w", err)
	}
	defer file.Close()

	head := make([]byte, 512)
	readBytes, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return nil, fmt.Errorf("read upload header: %w", err)
	}
	head = head[:readBytes]

	mimeType := strings.TrimSpace(http.DetectContentType(head))
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, requestError{message: "only image attachments are supported"}
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind upload: %w", err)
	}

	extension := filepath.Ext(fileHeader.Filename)
	if extension == "" {
		if extensions, err := mime.ExtensionsByType(mimeType); err == nil && len(extensions) > 0 {
			extension = extensions[0]
		}
	}

	attachmentID := uuid.NewString()
	storageKey := attachmentID + extension
	absolutePath := filepath.Join(s.uploadDir, storageKey)

	destination, err := os.Create(absolutePath)
	if err != nil {
		return nil, fmt.Errorf("create upload destination: %w", err)
	}

	if _, err := io.Copy(destination, file); err != nil {
		_ = destination.Close()
		_ = os.Remove(absolutePath)
		return nil, fmt.Errorf("persist upload: %w", err)
	}
	if err := destination.Close(); err != nil {
		_ = os.Remove(absolutePath)
		return nil, fmt.Errorf("close upload destination: %w", err)
	}

	record := &models.StoredAttachment{
		ID:         attachmentID,
		UserID:     userID,
		Name:       strings.TrimSpace(fileHeader.Filename),
		MIMEType:   mimeType,
		Size:       fileHeader.Size,
		StorageKey: storageKey,
	}
	if record.Name == "" {
		record.Name = "image" + extension
	}

	if err := s.db.Create(record).Error; err != nil {
		_ = os.Remove(absolutePath)
		return nil, fmt.Errorf("save upload metadata: %w", err)
	}

	attachment := toAttachment(record)
	return &attachment, nil
}

func (s *Service) ValidateForUser(userID uint, attachments []models.Attachment) ([]models.Attachment, error) {
	if len(attachments) > maxAttachments {
		return nil, requestError{message: fmt.Sprintf("a maximum of %d images can be attached", maxAttachments)}
	}

	normalized := make([]models.Attachment, 0, len(attachments))
	seen := map[string]struct{}{}

	for _, attachment := range attachments {
		attachmentID := strings.TrimSpace(attachment.ID)
		if attachmentID == "" {
			return nil, requestError{message: "attachment id is required"}
		}
		if _, exists := seen[attachmentID]; exists {
			continue
		}

		record, err := s.getForUser(userID, attachmentID)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, toAttachment(record))
		seen[attachmentID] = struct{}{}
	}

	return normalized, nil
}

func (s *Service) OpenForUser(userID uint, attachmentID string) (*models.StoredAttachment, string, error) {
	record, err := s.getForUser(userID, attachmentID)
	if err != nil {
		return nil, "", err
	}

	return record, filepath.Join(s.uploadDir, record.StorageKey), nil
}

func (s *Service) BuildModelAttachments(attachments []models.Attachment) ([]llm.Attachment, error) {
	result := make([]llm.Attachment, 0, len(attachments))
	for _, attachment := range attachments {
		record, err := s.getByID(attachment.ID)
		if err != nil {
			return nil, err
		}

		dataURL, err := s.dataURL(record)
		if err != nil {
			return nil, err
		}

		result = append(result, llm.Attachment{
			Name:     record.Name,
			MIMEType: record.MIMEType,
			URL:      dataURL,
		})
	}

	return result, nil
}

func (s *Service) CleanupUnreferenced(attachments []models.Attachment) error {
	seen := map[string]struct{}{}
	for _, attachment := range attachments {
		attachmentID := strings.TrimSpace(attachment.ID)
		if attachmentID == "" {
			continue
		}
		if _, exists := seen[attachmentID]; exists {
			continue
		}
		seen[attachmentID] = struct{}{}

		count, err := s.referenceCount(attachmentID)
		if err != nil {
			return err
		}
		if count > 0 {
			continue
		}

		record, err := s.getByID(attachmentID)
		if err != nil {
			if errors.Is(err, ErrAttachmentNotFound) {
				continue
			}
			return err
		}

		if err := s.db.Delete(&models.StoredAttachment{}, "id = ?", attachmentID).Error; err != nil {
			return fmt.Errorf("delete attachment metadata: %w", err)
		}
		if err := os.Remove(filepath.Join(s.uploadDir, record.StorageKey)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("delete attachment file: %w", err)
		}
	}

	return nil
}

func (s *Service) getForUser(userID uint, attachmentID string) (*models.StoredAttachment, error) {
	var record models.StoredAttachment
	if err := s.db.Where("id = ? AND user_id = ?", attachmentID, userID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAttachmentNotFound
		}
		return nil, fmt.Errorf("load attachment: %w", err)
	}

	return &record, nil
}

func (s *Service) getByID(attachmentID string) (*models.StoredAttachment, error) {
	var record models.StoredAttachment
	if err := s.db.Where("id = ?", attachmentID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAttachmentNotFound
		}
		return nil, fmt.Errorf("load attachment: %w", err)
	}

	return &record, nil
}

func (s *Service) dataURL(record *models.StoredAttachment) (string, error) {
	payload, err := os.ReadFile(filepath.Join(s.uploadDir, record.StorageKey))
	if err != nil {
		return "", fmt.Errorf("read attachment payload: %w", err)
	}

	return "data:" + record.MIMEType + ";base64," + base64.StdEncoding.EncodeToString(payload), nil
}

func (s *Service) referenceCount(attachmentID string) (int64, error) {
	var count int64
	likePattern := fmt.Sprintf("%%\"id\":\"%s\"%%", attachmentID)
	if err := s.db.Model(&models.Message{}).
		Where("attachments LIKE ?", likePattern).
		Count(&count).Error; err != nil {
		return 0, fmt.Errorf("count attachment references: %w", err)
	}

	return count, nil
}

func toAttachment(record *models.StoredAttachment) models.Attachment {
	return models.Attachment{
		ID:       record.ID,
		Name:     record.Name,
		MIMEType: record.MIMEType,
		URL:      AttachmentURL(record.ID),
		Size:     record.Size,
	}
}

func AttachmentURL(id string) string {
	return "/api/attachments/" + id + "/file"
}
