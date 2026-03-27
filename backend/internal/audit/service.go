package audit

import (
	"fmt"
	"strings"

	"backend/internal/models"

	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

type ListParams struct {
	Action string
	Limit  int
	Offset int
}

type ListResult struct {
	Logs  []models.AuditLog
	Total int64
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) Record(
	actor *models.User,
	action string,
	targetType string,
	targetID string,
	targetName string,
	summary string,
) error {
	log := models.AuditLog{
		Action:     strings.TrimSpace(action),
		TargetType: strings.TrimSpace(targetType),
		TargetID:   strings.TrimSpace(targetID),
		TargetName: strings.TrimSpace(targetName),
		Summary:    strings.TrimSpace(summary),
	}
	if actor != nil {
		log.ActorID = &actor.ID
		log.ActorUsername = strings.TrimSpace(actor.Username)
	}
	if err := s.db.Create(&log).Error; err != nil {
		return fmt.Errorf("create audit log: %w", err)
	}
	return nil
}

func (s *Service) List(params ListParams) (*ListResult, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := s.db.Model(&models.AuditLog{})
	action := strings.TrimSpace(params.Action)
	if action != "" {
		query = query.Where("action = ?", action)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("count audit logs: %w", err)
	}

	var logs []models.AuditLog
	if err := query.
		Order("created_at desc").
		Offset(maxInt(params.Offset, 0)).
		Limit(limit).
		Find(&logs).Error; err != nil {
		return nil, fmt.Errorf("list audit logs: %w", err)
	}

	return &ListResult{
		Logs:  logs,
		Total: total,
	}, nil
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
