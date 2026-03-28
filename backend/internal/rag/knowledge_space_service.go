package rag

import (
	"fmt"
	"strings"

	"backend/internal/models"

	"gorm.io/gorm"
)

type KnowledgeSpaceService struct {
	db *gorm.DB
}

func NewKnowledgeSpaceService(db *gorm.DB) *KnowledgeSpaceService {
	return &KnowledgeSpaceService{db: db}
}

func (s *KnowledgeSpaceService) ListSpaces(userID uint) ([]models.KnowledgeSpace, error) {
	var spaces []models.KnowledgeSpace
	if err := s.db.Where("user_id = ?", userID).Order("updated_at desc").Find(&spaces).Error; err != nil {
		return nil, fmt.Errorf("list knowledge spaces: %w", err)
	}
	return spaces, nil
}

func (s *KnowledgeSpaceService) CreateSpace(userID uint, input CreateKnowledgeSpaceInput) (*models.KnowledgeSpace, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, requestError{message: "knowledge space name is required"}
	}

	space := &models.KnowledgeSpace{
		UserID:      userID,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
	}
	if err := s.db.Create(space).Error; err != nil {
		return nil, fmt.Errorf("create knowledge space: %w", err)
	}
	return space, nil
}

func (s *KnowledgeSpaceService) UpdateSpace(userID uint, spaceID uint, input UpdateKnowledgeSpaceInput) (*models.KnowledgeSpace, error) {
	space, err := s.getSpace(userID, spaceID)
	if err != nil {
		return nil, err
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, requestError{message: "knowledge space name is required"}
		}
		space.Name = name
	}
	if input.Description != nil {
		space.Description = strings.TrimSpace(*input.Description)
	}

	if err := s.db.Save(space).Error; err != nil {
		return nil, fmt.Errorf("update knowledge space: %w", err)
	}
	return space, nil
}

func (s *KnowledgeSpaceService) DeleteSpace(userID uint, spaceID uint) error {
	if _, err := s.getSpace(userID, spaceID); err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.cleanupConversationReferences(tx, userID, spaceID); err != nil {
			return err
		}
		if err := s.cleanupWorkflowPresetReferences(tx, userID, spaceID); err != nil {
			return err
		}
		if err := tx.Where("user_id = ? AND knowledge_space_id = ?", userID, spaceID).Delete(&models.KnowledgeChunk{}).Error; err != nil {
			return fmt.Errorf("delete knowledge chunks: %w", err)
		}
		if err := tx.Where("user_id = ? AND knowledge_space_id = ?", userID, spaceID).Delete(&models.KnowledgeDocument{}).Error; err != nil {
			return fmt.Errorf("delete knowledge documents: %w", err)
		}
		if err := tx.Where("user_id = ? AND id = ?", userID, spaceID).Delete(&models.KnowledgeSpace{}).Error; err != nil {
			return fmt.Errorf("delete knowledge space: %w", err)
		}
		return nil
	})
}

func (s *KnowledgeSpaceService) getSpace(userID uint, spaceID uint) (*models.KnowledgeSpace, error) {
	var space models.KnowledgeSpace
	if err := s.db.Where("id = ? AND user_id = ?", spaceID, userID).First(&space).Error; err != nil {
		return nil, err
	}
	return &space, nil
}

func (s *KnowledgeSpaceService) cleanupConversationReferences(tx *gorm.DB, userID uint, spaceID uint) error {
	var conversations []models.Conversation
	if err := tx.Where("user_id = ?", userID).Find(&conversations).Error; err != nil {
		return fmt.Errorf("load conversations for knowledge space cleanup: %w", err)
	}

	for _, conversation := range conversations {
		filtered := filterKnowledgeSpaceIDs(conversation.KnowledgeSpaceIDs, spaceID)
		if len(filtered) == len(conversation.KnowledgeSpaceIDs) {
			continue
		}
		conversation.KnowledgeSpaceIDs = filtered
		if err := tx.Save(&conversation).Error; err != nil {
			return fmt.Errorf("update conversation knowledge spaces: %w", err)
		}
	}
	return nil
}

func (s *KnowledgeSpaceService) cleanupWorkflowPresetReferences(tx *gorm.DB, userID uint, spaceID uint) error {
	var presets []models.WorkflowPreset
	if err := tx.Where("user_id = ?", userID).Find(&presets).Error; err != nil {
		return fmt.Errorf("load workflow presets for knowledge space cleanup: %w", err)
	}

	for _, preset := range presets {
		filtered := filterKnowledgeSpaceIDs(preset.KnowledgeSpaceIDs, spaceID)
		if len(filtered) == len(preset.KnowledgeSpaceIDs) {
			continue
		}
		preset.KnowledgeSpaceIDs = filtered
		if err := tx.Save(&preset).Error; err != nil {
			return fmt.Errorf("update workflow preset knowledge spaces: %w", err)
		}
	}
	return nil
}

func filterKnowledgeSpaceIDs(values []uint, deletedID uint) []uint {
	filtered := make([]uint, 0, len(values))
	for _, value := range values {
		if value != deletedID {
			filtered = append(filtered, value)
		}
	}
	return filtered
}
