package rag

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"backend/internal/attachment"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	providers *ProviderService
	spaces    *KnowledgeSpaceService
	documents *KnowledgeDocumentService
	fetcher   interface {
		FetchURL(ctx context.Context, url string) (string, error)
	}
}

func NewHandler(
	providers *ProviderService,
	spaces *KnowledgeSpaceService,
	documents *KnowledgeDocumentService,
	fetcher interface {
		FetchURL(ctx context.Context, url string) (string, error)
	},
) *Handler {
	return &Handler{
		providers: providers,
		spaces:    spaces,
		documents: documents,
		fetcher:   fetcher,
	}
}

type providerRequest struct {
	Name           string `json:"name"`
	BaseURL        string `json:"baseURL"`
	APIKey         string `json:"apiKey"`
	EmbeddingModel string `json:"embeddingModel"`
	RerankerModel  string `json:"rerankerModel"`
}

type knowledgeSpaceRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type createKnowledgeDocumentRequest struct {
	Title      string `json:"title"`
	SourceType string `json:"sourceType"`
	SourceURI  string `json:"sourceUri"`
	Content    string `json:"content"`
}

type updateKnowledgeDocumentRequest struct {
	Title     *string `json:"title"`
	SourceURI *string `json:"sourceUri"`
	Content   *string `json:"content"`
}

func handleError(c *gin.Context, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "resource not found"})
		return
	}
	if _, ok := err.(requestError); ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if attachment.IsRequestError(err) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err == context.Canceled {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

func idParam(c *gin.Context, name string) (uint, error) {
	rawID := c.Param(name)
	parsed, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(parsed), nil
}

func spaceIDParam(c *gin.Context) (uint, error) {
	if c.Param("spaceId") != "" {
		return idParam(c, "spaceId")
	}
	return idParam(c, "id")
}
