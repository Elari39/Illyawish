package rag

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"

	"backend/internal/attachment"
	"backend/internal/auth"

	"github.com/gin-gonic/gin"
)

func (h *Handler) UploadKnowledgeDocuments(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, err := spaceIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space id"})
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "knowledge files are required"})
		return
	}
	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "knowledge files are required"})
		return
	}

	inputs := make([]CreateKnowledgeDocumentInput, 0, len(files))
	for _, fileHeader := range files {
		input, err := prepareKnowledgeDocumentUploadInput(fileHeader)
		if err != nil {
			handleError(c, err)
			return
		}
		inputs = append(inputs, input)
	}

	created, err := h.documents.CreateDocumentsBatch(c.Request.Context(), user.ID, spaceID, inputs)
	if err != nil {
		handleError(c, err)
		return
	}

	documents := make([]knowledgeDocumentDTO, 0, len(created))
	for _, document := range created {
		documents = append(documents, toKnowledgeDocumentDTO(document))
	}

	c.JSON(http.StatusCreated, gin.H{"documents": documents})
}

func prepareKnowledgeDocumentUploadInput(
	fileHeader *multipart.FileHeader,
) (CreateKnowledgeDocumentInput, error) {
	prepared, err := prepareKnowledgeUploadFile(fileHeader)
	if err != nil {
		return CreateKnowledgeDocumentInput{}, err
	}

	title := fileHeader.Filename
	if title == "" {
		title = "attachment"
	}

	return CreateKnowledgeDocumentInput{
		Title:      title,
		SourceType: SourceTypeAttachment,
		MIMEType:   prepared.MIMEType,
		Content:    prepared.Content,
	}, nil
}

func (h *Handler) ReplaceKnowledgeDocumentFile(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, documentID, ok := knowledgeDocumentIDs(c)
	if !ok {
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "knowledge file is required"})
		return
	}

	prepared, err := prepareKnowledgeUploadFile(fileHeader)
	if err != nil {
		handleError(c, err)
		return
	}

	title := c.PostForm("title")
	if title == "" {
		title = fileHeader.Filename
	}

	document, err := h.documents.ReplaceAttachmentDocument(
		c.Request.Context(),
		user.ID,
		spaceID,
		documentID,
		ReplaceKnowledgeDocumentFileInput{
			Title:    title,
			MIMEType: prepared.MIMEType,
			Content:  prepared.Content,
		},
	)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"document": toKnowledgeDocumentDTO(*document)})
}

func prepareKnowledgeUploadFile(fileHeader *multipart.FileHeader) (*attachment.PreparedKnowledgeUpload, error) {
	if fileHeader == nil {
		return nil, requestError{message: "knowledge file is required"}
	}

	file, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("open knowledge upload: %w", err)
	}
	defer file.Close()

	payload, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("read knowledge upload: %w", err)
	}

	return attachment.PrepareKnowledgeUpload(fileHeader.Filename, payload)
}
