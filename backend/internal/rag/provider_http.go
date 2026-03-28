package rag

import (
	"net/http"

	"backend/internal/auth"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListProviders(c *gin.Context) {
	user := auth.CurrentUser(c)
	state, err := h.providers.ListProviderState(user.ID)
	if err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *Handler) CreateProvider(c *gin.Context) {
	user := auth.CurrentUser(c)
	var req providerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rag provider payload"})
		return
	}
	if _, err := h.providers.CreateProviderPreset(user.ID, CreateProviderPresetInput{
		Name:           req.Name,
		BaseURL:        req.BaseURL,
		APIKey:         req.APIKey,
		EmbeddingModel: req.EmbeddingModel,
		RerankerModel:  req.RerankerModel,
	}); err != nil {
		handleError(c, err)
		return
	}
	h.ListProviders(c)
}

func (h *Handler) UpdateProvider(c *gin.Context) {
	user := auth.CurrentUser(c)
	providerID, err := idParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rag provider id"})
		return
	}
	var req providerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rag provider payload"})
		return
	}
	if _, err := h.providers.UpdateProviderPreset(user.ID, providerID, UpdateProviderPresetInput{
		Name:           &req.Name,
		BaseURL:        &req.BaseURL,
		APIKey:         &req.APIKey,
		EmbeddingModel: &req.EmbeddingModel,
		RerankerModel:  &req.RerankerModel,
	}); err != nil {
		handleError(c, err)
		return
	}
	h.ListProviders(c)
}

func (h *Handler) ActivateProvider(c *gin.Context) {
	user := auth.CurrentUser(c)
	providerID, err := idParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rag provider id"})
		return
	}
	if _, err := h.providers.ActivateProviderPreset(user.ID, providerID); err != nil {
		handleError(c, err)
		return
	}
	h.ListProviders(c)
}

func (h *Handler) DeleteProvider(c *gin.Context) {
	user := auth.CurrentUser(c)
	providerID, err := idParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rag provider id"})
		return
	}
	if err := h.providers.DeleteProviderPreset(user.ID, providerID); err != nil {
		handleError(c, err)
		return
	}
	h.ListProviders(c)
}
