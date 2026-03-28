package workflow

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

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type presetRequest struct {
	Name              string          `json:"name"`
	TemplateKey       string          `json:"templateKey"`
	DefaultInputs     map[string]any  `json:"defaultInputs"`
	KnowledgeSpaceIDs []uint          `json:"knowledgeSpaceIds"`
	ToolEnablements   map[string]bool `json:"toolEnablements"`
	OutputMode        string          `json:"outputMode"`
}

type updatePresetRequest struct {
	Name              *string          `json:"name"`
	TemplateKey       *string          `json:"templateKey"`
	DefaultInputs     map[string]any   `json:"defaultInputs"`
	KnowledgeSpaceIDs []uint           `json:"knowledgeSpaceIds"`
	ToolEnablements   map[string]bool  `json:"toolEnablements"`
	OutputMode        *string          `json:"outputMode"`
}

type WorkflowPresetDTO struct {
	ID                uint            `json:"id"`
	UserID            uint            `json:"userId"`
	Name              string          `json:"name"`
	TemplateKey       string          `json:"templateKey"`
	DefaultInputs     map[string]any  `json:"defaultInputs"`
	KnowledgeSpaceIDs []uint          `json:"knowledgeSpaceIds"`
	ToolEnablements   map[string]bool `json:"toolEnablements"`
	OutputMode        string          `json:"outputMode"`
	CreatedAt         string          `json:"createdAt"`
	UpdatedAt         string          `json:"updatedAt"`
}

func (h *Handler) ListBuiltIns(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"templates": BuiltInCatalog()})
}

func (h *Handler) ListPresets(c *gin.Context) {
	user := auth.CurrentUser(c)
	presets, err := h.service.ListPresets(user.ID)
	if err != nil {
		handleWorkflowError(c, err)
		return
	}
	dtos := make([]WorkflowPresetDTO, 0, len(presets))
	for index := range presets {
		dtos = append(dtos, toWorkflowPresetDTO(&presets[index]))
	}
	c.JSON(http.StatusOK, gin.H{"presets": dtos})
}

func (h *Handler) CreatePreset(c *gin.Context) {
	user := auth.CurrentUser(c)
	var req presetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow preset payload"})
		return
	}
	preset, err := h.service.CreatePreset(user.ID, CreatePresetInput{
		Name:              req.Name,
		TemplateKey:       req.TemplateKey,
		DefaultInputs:     req.DefaultInputs,
		KnowledgeSpaceIDs: req.KnowledgeSpaceIDs,
		ToolEnablements:   req.ToolEnablements,
		OutputMode:        req.OutputMode,
	})
	if err != nil {
		handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"preset": toWorkflowPresetDTO(preset)})
}

func (h *Handler) UpdatePreset(c *gin.Context) {
	user := auth.CurrentUser(c)
	presetID, err := workflowPresetIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow preset id"})
		return
	}

	var req updatePresetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow preset payload"})
		return
	}

	preset, err := h.service.UpdatePreset(user.ID, presetID, UpdatePresetInput{
		Name:              req.Name,
		TemplateKey:       req.TemplateKey,
		DefaultInputs:     req.DefaultInputs,
		KnowledgeSpaceIDs: req.KnowledgeSpaceIDs,
		ToolEnablements:   req.ToolEnablements,
		OutputMode:        req.OutputMode,
	})
	if err != nil {
		handleWorkflowError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"preset": toWorkflowPresetDTO(preset)})
}

func (h *Handler) DeletePreset(c *gin.Context) {
	user := auth.CurrentUser(c)
	presetID, err := workflowPresetIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow preset id"})
		return
	}

	if err := h.service.DeletePreset(user.ID, presetID); err != nil {
		handleWorkflowError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
	c.Writer.WriteHeaderNow()
}

func workflowPresetIDParam(c *gin.Context) (uint, error) {
	rawID := c.Param("id")
	parsed, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(parsed), nil
}

func toWorkflowPresetDTO(preset *models.WorkflowPreset) WorkflowPresetDTO {
	return WorkflowPresetDTO{
		ID:                preset.ID,
		UserID:            preset.UserID,
		Name:              preset.Name,
		TemplateKey:       preset.TemplateKey,
		DefaultInputs:     cloneDefaultInputs(preset.DefaultInputs),
		KnowledgeSpaceIDs: append([]uint(nil), preset.KnowledgeSpaceIDs...),
		ToolEnablements:   cloneToolEnablements(preset.ToolEnablements),
		OutputMode:        preset.OutputMode,
		CreatedAt:         preset.CreatedAt.Format(timeFormat),
		UpdatedAt:         preset.UpdatedAt.Format(timeFormat),
	}
}

func cloneDefaultInputs(values map[string]any) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneToolEnablements(values map[string]bool) map[string]bool {
	if len(values) == 0 {
		return map[string]bool{}
	}
	cloned := make(map[string]bool, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func handleWorkflowError(c *gin.Context, err error) {
	if isRequestError(err) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow preset not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}
