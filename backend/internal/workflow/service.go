package workflow

import (
	"errors"
	"fmt"
	"strings"

	"backend/internal/models"

	"gorm.io/gorm"
)

type CreatePresetInput struct {
	Name              string
	TemplateKey       string
	DefaultInputs     map[string]any
	KnowledgeSpaceIDs []uint
	ToolEnablements   map[string]bool
	OutputMode        string
}

type UpdatePresetInput struct {
	Name              *string
	TemplateKey       *string
	DefaultInputs     map[string]any
	KnowledgeSpaceIDs []uint
	ToolEnablements   map[string]bool
	OutputMode        *string
}

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) ListPresets(userID uint) ([]models.WorkflowPreset, error) {
	var presets []models.WorkflowPreset
	if err := s.db.Where("user_id = ?", userID).
		Order("updated_at desc").
		Find(&presets).Error; err != nil {
		return nil, fmt.Errorf("list workflow presets: %w", err)
	}
	return presets, nil
}

func (s *Service) GetPreset(userID uint, presetID uint) (*models.WorkflowPreset, error) {
	var preset models.WorkflowPreset
	if err := s.db.Where("id = ? AND user_id = ?", presetID, userID).First(&preset).Error; err != nil {
		return nil, fmt.Errorf("get workflow preset: %w", err)
	}
	return &preset, nil
}

func (s *Service) CreatePreset(userID uint, input CreatePresetInput) (*models.WorkflowPreset, error) {
	normalized, err := sanitizeCreatePresetInput(input)
	if err != nil {
		return nil, err
	}
	preset := &models.WorkflowPreset{
		UserID:            userID,
		Name:              normalized.Name,
		TemplateKey:       normalized.TemplateKey,
		DefaultInputs:     normalized.DefaultInputs,
		KnowledgeSpaceIDs: normalized.KnowledgeSpaceIDs,
		ToolEnablements:   normalized.ToolEnablements,
		OutputMode:        normalized.OutputMode,
	}
	if err := s.db.Create(preset).Error; err != nil {
		return nil, fmt.Errorf("create workflow preset: %w", err)
	}
	return preset, nil
}

func (s *Service) UpdatePreset(userID uint, presetID uint, input UpdatePresetInput) (*models.WorkflowPreset, error) {
	preset, err := s.getPreset(userID, presetID)
	if err != nil {
		return nil, err
	}

	normalized, err := sanitizeUpdatePresetInput(input, preset)
	if err != nil {
		return nil, err
	}

	hasUpdates := false
	if normalized.Name != nil {
		preset.Name = *normalized.Name
		hasUpdates = true
	}
	if normalized.TemplateKey != nil {
		preset.TemplateKey = *normalized.TemplateKey
		hasUpdates = true
	}
	if normalized.DefaultInputs != nil {
		preset.DefaultInputs = normalized.DefaultInputs
		hasUpdates = true
	}
	if normalized.KnowledgeSpaceIDs != nil {
		preset.KnowledgeSpaceIDs = normalized.KnowledgeSpaceIDs
		hasUpdates = true
	}
	if normalized.ToolEnablements != nil {
		preset.ToolEnablements = normalized.ToolEnablements
		hasUpdates = true
	}
	if normalized.OutputMode != nil {
		preset.OutputMode = *normalized.OutputMode
		hasUpdates = true
	}
	if !hasUpdates {
		return preset, nil
	}

	if err := s.db.Save(preset).Error; err != nil {
		return nil, fmt.Errorf("update workflow preset: %w", err)
	}

	return s.getPreset(userID, presetID)
}

func (s *Service) DeletePreset(userID uint, presetID uint) error {
	preset, err := s.getPreset(userID, presetID)
	if err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Conversation{}).
			Where("user_id = ? AND workflow_preset_id = ?", userID, presetID).
			Update("workflow_preset_id", nil).Error; err != nil {
			return fmt.Errorf("clear conversation workflow preset: %w", err)
		}
		if err := tx.Delete(preset).Error; err != nil {
			return fmt.Errorf("delete workflow preset: %w", err)
		}
		return nil
	})
}

func sanitizeCreatePresetInput(input CreatePresetInput) (CreatePresetInput, error) {
	normalized := CreatePresetInput{
		Name:              strings.TrimSpace(input.Name),
		TemplateKey:       strings.TrimSpace(input.TemplateKey),
		DefaultInputs:     input.DefaultInputs,
		KnowledgeSpaceIDs: append([]uint(nil), input.KnowledgeSpaceIDs...),
		ToolEnablements:   input.ToolEnablements,
		OutputMode:        strings.TrimSpace(input.OutputMode),
	}
	if normalized.Name == "" {
		return CreatePresetInput{}, requestError{message: "workflow preset name is required"}
	}
	if normalized.TemplateKey == "" {
		return CreatePresetInput{}, requestError{message: "workflow template key is required"}
	}
	if _, ok := BuiltInCatalog()[normalized.TemplateKey]; !ok {
		return CreatePresetInput{}, requestError{message: "workflow template key is invalid"}
	}
	if normalized.DefaultInputs == nil {
		normalized.DefaultInputs = map[string]any{}
	}
	if normalized.ToolEnablements == nil {
		normalized.ToolEnablements = map[string]bool{}
	}
	if normalized.OutputMode == "" {
		normalized.OutputMode = "default"
	}
	return normalized, nil
}

func sanitizeUpdatePresetInput(input UpdatePresetInput, existing *models.WorkflowPreset) (UpdatePresetInput, error) {
	normalized := UpdatePresetInput{
		DefaultInputs:     input.DefaultInputs,
		KnowledgeSpaceIDs: input.KnowledgeSpaceIDs,
		ToolEnablements:   input.ToolEnablements,
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return UpdatePresetInput{}, requestError{message: "workflow preset name is required"}
		}
		normalized.Name = &name
	}
	if input.TemplateKey != nil {
		templateKey := strings.TrimSpace(*input.TemplateKey)
		if templateKey == "" {
			return UpdatePresetInput{}, requestError{message: "workflow template key is required"}
		}
		if _, ok := BuiltInCatalog()[templateKey]; !ok {
			return UpdatePresetInput{}, requestError{message: "workflow template key is invalid"}
		}
		normalized.TemplateKey = &templateKey
	}
	if input.OutputMode != nil {
		outputMode := strings.TrimSpace(*input.OutputMode)
		if outputMode == "" {
			outputMode = existing.OutputMode
		}
		if outputMode == "" {
			outputMode = "default"
		}
		normalized.OutputMode = &outputMode
	}

	return normalized, nil
}

func (s *Service) getPreset(userID uint, presetID uint) (*models.WorkflowPreset, error) {
	preset, err := s.GetPreset(userID, presetID)
	if err != nil {
		return nil, err
	}
	return preset, nil
}

type requestError struct {
	message string
}

func (e requestError) Error() string {
	return e.message
}

func isRequestError(err error) bool {
	var target requestError
	return errors.As(err, &target)
}
