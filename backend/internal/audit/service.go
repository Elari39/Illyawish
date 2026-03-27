package audit

import (
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

type ListParams struct {
	Actor      string
	Action     string
	TargetType string
	DateFrom   *time.Time
	DateTo     *time.Time
	Limit      int
	Offset     int
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
	actor := strings.TrimSpace(params.Actor)
	if actor != "" {
		query = query.Where("LOWER(actor_username) LIKE ?", "%"+strings.ToLower(actor)+"%")
	}
	action := strings.TrimSpace(params.Action)
	if action != "" {
		query = query.Where("action = ?", action)
	}
	targetType := strings.TrimSpace(params.TargetType)
	if targetType != "" {
		query = query.Where("target_type = ?", targetType)
	}
	if params.DateFrom != nil {
		query = query.Where("created_at >= ?", params.DateFrom.UTC())
	}
	if params.DateTo != nil {
		query = query.Where("created_at < ?", params.DateTo.UTC())
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
