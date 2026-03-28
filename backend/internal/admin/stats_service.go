package admin

import (
	"fmt"
	"time"

	"backend/internal/audit"
	"backend/internal/models"

	"gorm.io/gorm"
)

func (s *Service) ListAuditLogs(params audit.ListParams) (*audit.ListResult, error) {
	if s.audit == nil {
		return &audit.ListResult{}, nil
	}
	return s.audit.List(params)
}

func (s *Service) GetUsageStats() (*UsageStats, error) {
	recentSince := time.Now().Add(-7 * 24 * time.Hour).UTC()
	stats := &UsageStats{}

	counters := []struct {
		model any
		dest  *int64
		query func(*gorm.DB) *gorm.DB
	}{
		{model: &models.User{}, dest: &stats.TotalUsers},
		{
			model: &models.User{},
			dest:  &stats.ActiveUsers,
			query: func(db *gorm.DB) *gorm.DB {
				return db.Where("status = ?", models.UserStatusActive)
			},
		},
		{
			model: &models.User{},
			dest:  &stats.RecentUsers,
			query: func(db *gorm.DB) *gorm.DB {
				return db.Where("last_login_at >= ?", recentSince)
			},
		},
		{model: &models.Conversation{}, dest: &stats.TotalConversations},
		{model: &models.Message{}, dest: &stats.TotalMessages},
		{model: &models.StoredAttachment{}, dest: &stats.TotalAttachments},
		{model: &models.LLMProviderPreset{}, dest: &stats.ConfiguredProviderPresets},
		{
			model: &models.LLMProviderPreset{},
			dest:  &stats.ActiveProviderPresets,
			query: func(db *gorm.DB) *gorm.DB {
				return db.Where("is_active = ?", true)
			},
		},
	}

	for _, counter := range counters {
		query := s.db.Model(counter.model)
		if counter.query != nil {
			query = counter.query(query)
		}
		if err := query.Count(counter.dest).Error; err != nil {
			return nil, fmt.Errorf("count usage stats: %w", err)
		}
	}

	if err := s.db.Model(&models.LLMProviderPreset{}).
		Select("name, base_url, count(*) as user_count").
		Where("is_active = ?", true).
		Group("name, base_url").
		Order("user_count desc, name asc, base_url asc").
		Scan(&stats.ActiveProviderDistribution).Error; err != nil {
		return nil, fmt.Errorf("list active provider distribution: %w", err)
	}

	return stats, nil
}
