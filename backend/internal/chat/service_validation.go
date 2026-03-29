package chat

import (
	"fmt"

	"backend/internal/models"
)

func (s *Service) validateProviderPresetOwnership(userID uint, providerPresetID *uint) error {
	if providerPresetID == nil || *providerPresetID == 0 {
		return nil
	}

	var count int64
	if err := s.db.Model(&models.LLMProviderPreset{}).
		Where("id = ? AND user_id = ?", *providerPresetID, userID).
		Count(&count).Error; err != nil {
		return fmt.Errorf("validate provider preset: %w", err)
	}
	if count == 0 {
		return requestError{message: "provider preset not found"}
	}

	return nil
}

func (s *Service) validateWorkflowPresetOwnership(userID uint, workflowPresetID *uint) error {
	if workflowPresetID == nil || *workflowPresetID == 0 {
		return nil
	}

	var count int64
	if err := s.db.Model(&models.WorkflowPreset{}).
		Where("id = ? AND user_id = ?", *workflowPresetID, userID).
		Count(&count).Error; err != nil {
		return fmt.Errorf("validate workflow preset: %w", err)
	}
	if count == 0 {
		return requestError{message: "workflow preset not found"}
	}

	return nil
}

func (s *Service) validateKnowledgeSpaceOwnership(userID uint, knowledgeSpaceIDs []uint) error {
	knowledgeSpaceIDs = cloneUintSlice(knowledgeSpaceIDs)
	if len(knowledgeSpaceIDs) == 0 {
		return nil
	}

	var count int64
	if err := s.db.Model(&models.KnowledgeSpace{}).
		Where("user_id = ? AND id IN ?", userID, knowledgeSpaceIDs).
		Count(&count).Error; err != nil {
		return fmt.Errorf("validate knowledge spaces: %w", err)
	}
	if count != int64(len(knowledgeSpaceIDs)) {
		return requestError{message: "knowledge space not found"}
	}

	return nil
}
