package rag

import (
	"net/http"
	"strings"

	"backend/internal/auth"
	"backend/internal/models"
	"backend/internal/network"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListKnowledgeSpaces(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaces, err := h.spaces.ListSpaces(user.ID)
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"spaces": toKnowledgeSpaceDTOs(spaces)})
}

func (h *Handler) CreateKnowledgeSpace(c *gin.Context) {
	user := auth.CurrentUser(c)
	var req knowledgeSpaceRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space payload"})
		return
	}

	description := ""
	if req.Description != nil {
		description = *req.Description
	}
	space, err := h.spaces.CreateSpace(user.ID, CreateKnowledgeSpaceInput{
		Name:        *req.Name,
		Description: description,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"space": toKnowledgeSpaceDTO(*space)})
}

func (h *Handler) UpdateKnowledgeSpace(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, err := spaceIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space id"})
		return
	}
	var req knowledgeSpaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space payload"})
		return
	}

	space, err := h.spaces.UpdateSpace(user.ID, spaceID, UpdateKnowledgeSpaceInput{
		Name:        req.Name,
		Description: req.Description,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"space": toKnowledgeSpaceDTO(*space)})
}

func (h *Handler) DeleteKnowledgeSpace(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, err := spaceIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space id"})
		return
	}
	if err := h.spaces.DeleteSpace(user.ID, spaceID); err != nil {
		handleError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) CreateKnowledgeDocument(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, err := spaceIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space id"})
		return
	}
	var req createKnowledgeDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge document payload"})
		return
	}

	content := strings.TrimSpace(req.Content)
	sourceType := strings.TrimSpace(req.SourceType)
	sourceURI := strings.TrimSpace(req.SourceURI)
	if sourceType == SourceTypeURL && sourceURI != "" {
		if _, err := network.ValidatePublicHTTPURL(c.Request.Context(), sourceURI); err != nil {
			handleError(c, requestError{message: err.Error()})
			return
		}
	}
	if sourceType == SourceTypeURL && content == "" && sourceURI != "" && h.fetcher != nil {
		fetched, err := h.fetcher.FetchURL(c.Request.Context(), sourceURI)
		if err != nil {
			handleError(c, err)
			return
		}
		content = fetched
	}

	document, err := h.documents.CreateDocument(c.Request.Context(), user.ID, spaceID, CreateKnowledgeDocumentInput{
		Title:      req.Title,
		SourceType: req.SourceType,
		SourceURI:  req.SourceURI,
		Content:    content,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"document": toKnowledgeDocumentDTO(*document)})
}

func (h *Handler) UpdateKnowledgeDocument(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, documentID, ok := knowledgeDocumentIDs(c)
	if !ok {
		return
	}
	var req updateKnowledgeDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge document payload"})
		return
	}

	existing, err := h.documents.getDocument(user.ID, spaceID, documentID)
	if err != nil {
		handleError(c, err)
		return
	}

	content, err := h.resolveKnowledgeDocumentUpdateContent(c, existing, req)
	if err != nil {
		handleError(c, err)
		return
	}

	document, err := h.documents.UpdateDocument(c.Request.Context(), user.ID, spaceID, documentID, UpdateKnowledgeDocumentInput{
		Title:     req.Title,
		SourceURI: req.SourceURI,
		Content:   content,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"document": toKnowledgeDocumentDTO(*document)})
}

func (h *Handler) resolveKnowledgeDocumentUpdateContent(
	c *gin.Context,
	existing *models.KnowledgeDocument,
	req updateKnowledgeDocumentRequest,
) (*string, error) {
	if existing.SourceType != SourceTypeURL {
		return req.Content, nil
	}

	trimmedSourceURI := existing.SourceURI
	sourceURIChanged := false
	if req.SourceURI != nil {
		trimmedSourceURI = strings.TrimSpace(*req.SourceURI)
		sourceURIChanged = trimmedSourceURI != strings.TrimSpace(existing.SourceURI)
		if trimmedSourceURI != "" {
			if _, err := network.ValidatePublicHTTPURL(c.Request.Context(), trimmedSourceURI); err != nil {
				return nil, requestError{message: err.Error()}
			}
		}
	}

	if !sourceURIChanged {
		if req.Content != nil && strings.TrimSpace(*req.Content) == "" && trimmedSourceURI != "" && h.fetcher != nil {
			fetched, err := h.fetcher.FetchURL(c.Request.Context(), trimmedSourceURI)
			if err != nil {
				return nil, err
			}
			return &fetched, nil
		}
		return req.Content, nil
	}

	if trimmedSourceURI == "" || h.fetcher == nil {
		return req.Content, nil
	}
	if shouldRefetchKnowledgeDocumentContent(existing, req.Content) {
		fetched, err := h.fetcher.FetchURL(c.Request.Context(), trimmedSourceURI)
		if err != nil {
			return nil, err
		}
		return &fetched, nil
	}
	return req.Content, nil
}

func shouldRefetchKnowledgeDocumentContent(
	existing *models.KnowledgeDocument,
	content *string,
) bool {
	if content == nil {
		return true
	}
	trimmedContent := strings.TrimSpace(*content)
	if trimmedContent == "" {
		return true
	}
	return trimmedContent == strings.TrimSpace(existing.Content)
}

func (h *Handler) DeleteKnowledgeDocument(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, documentID, ok := knowledgeDocumentIDs(c)
	if !ok {
		return
	}
	if err := h.documents.DeleteDocument(user.ID, spaceID, documentID); err != nil {
		handleError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) ListKnowledgeDocuments(c *gin.Context) {
	user := auth.CurrentUser(c)
	spaceID, err := spaceIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space id"})
		return
	}
	documents, err := h.documents.ListDocuments(user.ID, spaceID)
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"documents": toKnowledgeDocumentDTOs(documents)})
}

func knowledgeDocumentIDs(c *gin.Context) (uint, uint, bool) {
	spaceID, err := spaceIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge space id"})
		return 0, 0, false
	}
	documentID, err := idParam(c, "documentId")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid knowledge document id"})
		return 0, 0, false
	}
	return spaceID, documentID, true
}
