package attachment

import (
	"errors"
	"net/http"
	"strings"

	"backend/internal/auth"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Upload(c *gin.Context) {
	user := auth.CurrentUser(c)
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "attachment file is required"})
		return
	}

	attachment, err := h.service.SaveUpload(user.ID, fileHeader)
	if err != nil {
		handleAttachmentError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"attachment": attachment})
}

func (h *Handler) File(c *gin.Context) {
	user := auth.CurrentUser(c)
	attachmentID := strings.TrimSpace(c.Param("id"))
	record, path, err := h.service.OpenForUser(user.ID, attachmentID)
	if err != nil {
		handleAttachmentError(c, err)
		return
	}

	c.Header("Cache-Control", "private, max-age=3600")
	c.Header("Content-Type", record.MIMEType)
	c.File(path)
}

func handleAttachmentError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrAttachmentNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
	case IsRequestError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "attachment request failed"})
	}
}
