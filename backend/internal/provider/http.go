package provider

import (
	"errors"
	"net/http"
	"strconv"

	"backend/internal/auth"
	"backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const timeFormat = "2006-01-02T15:04:05Z07:00"

type Handler struct {
	service *Service
}

type ProviderPresetDTO struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	BaseURL      string `json:"baseURL"`
	APIKeyHint   string `json:"apiKeyHint"`
	DefaultModel string `json:"defaultModel"`
	IsActive     bool   `json:"isActive"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type ProviderFallbackDTO struct {
	Available    bool   `json:"available"`
	BaseURL      string `json:"baseURL"`
	DefaultModel string `json:"defaultModel"`
}

type ProviderStateDTO struct {
	Presets        []ProviderPresetDTO `json:"presets"`
	ActivePresetID *uint               `json:"activePresetId"`
	CurrentSource  string              `json:"currentSource"`
	Fallback       ProviderFallbackDTO `json:"fallback"`
}

type createProviderRequest struct {
	Name         string `json:"name"`
	BaseURL      string `json:"baseURL"`
	APIKey       string `json:"apiKey"`
	DefaultModel string `json:"defaultModel"`
}

type updateProviderRequest struct {
	Name         *string `json:"name"`
	BaseURL      *string `json:"baseURL"`
	APIKey       *string `json:"apiKey"`
	DefaultModel *string `json:"defaultModel"`
}

type testProviderRequest struct {
	ProviderID   *uint  `json:"providerId"`
	BaseURL      string `json:"baseURL"`
	APIKey       string `json:"apiKey"`
	DefaultModel string `json:"defaultModel"`
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) ListProviders(c *gin.Context) {
	user := auth.CurrentUser(c)
	state, err := h.service.ListState(user.ID)
	if err != nil {
		handleProviderError(c, err)
		return
	}

	c.JSON(http.StatusOK, toProviderStateDTO(state))
}

func (h *Handler) CreateProvider(c *gin.Context) {
	user := auth.CurrentUser(c)

	var req createProviderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider payload"})
		return
	}

	if _, err := h.service.CreatePreset(user.ID, CreatePresetInput{
		Name:         req.Name,
		BaseURL:      req.BaseURL,
		APIKey:       req.APIKey,
		DefaultModel: req.DefaultModel,
	}); err != nil {
		handleProviderError(c, err)
		return
	}

	h.renderProviderState(c, user.ID, http.StatusCreated)
}

func (h *Handler) UpdateProvider(c *gin.Context) {
	user := auth.CurrentUser(c)
	presetID, err := providerIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider id"})
		return
	}

	var req updateProviderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider payload"})
		return
	}

	if _, err := h.service.UpdatePreset(user.ID, presetID, UpdatePresetInput{
		Name:         req.Name,
		BaseURL:      req.BaseURL,
		APIKey:       req.APIKey,
		DefaultModel: req.DefaultModel,
	}); err != nil {
		handleProviderError(c, err)
		return
	}

	h.renderProviderState(c, user.ID, http.StatusOK)
}

func (h *Handler) ActivateProvider(c *gin.Context) {
	user := auth.CurrentUser(c)
	presetID, err := providerIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider id"})
		return
	}

	if _, err := h.service.ActivatePreset(user.ID, presetID); err != nil {
		handleProviderError(c, err)
		return
	}

	h.renderProviderState(c, user.ID, http.StatusOK)
}

func (h *Handler) DeleteProvider(c *gin.Context) {
	user := auth.CurrentUser(c)
	presetID, err := providerIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider id"})
		return
	}

	if err := h.service.DeletePreset(user.ID, presetID); err != nil {
		handleProviderError(c, err)
		return
	}

	h.renderProviderState(c, user.ID, http.StatusOK)
}

func (h *Handler) TestProvider(c *gin.Context) {
	user := auth.CurrentUser(c)

	var req testProviderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider payload"})
		return
	}

	result, err := h.service.TestPreset(c.Request.Context(), user.ID, TestPresetInput{
		PresetID:     req.ProviderID,
		BaseURL:      req.BaseURL,
		APIKey:       req.APIKey,
		DefaultModel: req.DefaultModel,
	})
	if err != nil {
		handleProviderError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":              result.OK,
		"message":         result.Message,
		"resolvedBaseURL": result.ResolvedBaseURL,
		"resolvedModel":   result.ResolvedModel,
	})
}

func (h *Handler) renderProviderState(c *gin.Context, userID uint, status int) {
	state, err := h.service.ListState(userID)
	if err != nil {
		handleProviderError(c, err)
		return
	}

	c.JSON(status, toProviderStateDTO(state))
}

func providerIDParam(c *gin.Context) (uint, error) {
	rawID := c.Param("id")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

func toProviderStateDTO(state *State) ProviderStateDTO {
	presets := make([]ProviderPresetDTO, 0, len(state.Presets))
	for _, preset := range state.Presets {
		presets = append(presets, toProviderPresetDTO(&preset))
	}

	return ProviderStateDTO{
		Presets:        presets,
		ActivePresetID: state.ActivePresetID,
		CurrentSource:  state.CurrentSource,
		Fallback: ProviderFallbackDTO{
			Available:    state.Fallback.Available,
			BaseURL:      state.Fallback.BaseURL,
			DefaultModel: state.Fallback.DefaultModel,
		},
	}
}

func toProviderPresetDTO(preset *models.LLMProviderPreset) ProviderPresetDTO {
	return ProviderPresetDTO{
		ID:           preset.ID,
		Name:         preset.Name,
		BaseURL:      preset.BaseURL,
		APIKeyHint:   preset.APIKeyHint,
		DefaultModel: preset.DefaultModel,
		IsActive:     preset.IsActive,
		CreatedAt:    preset.CreatedAt.Format(timeFormat),
		UpdatedAt:    preset.UpdatedAt.Format(timeFormat),
	}
}

func handleProviderError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "provider preset not found"})
	case IsRequestError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "provider request failed"})
	}
}
