package attachment

import (
	"context"
	"log"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

const retentionSweepInterval = time.Hour

type RetentionWorker struct {
	db      *gorm.DB
	service *Service
	logger  *log.Logger
}

func NewRetentionWorker(db *gorm.DB, service *Service, logger *log.Logger) *RetentionWorker {
	return &RetentionWorker{
		db:      db,
		service: service,
		logger:  logger,
	}
}

func (w *RetentionWorker) Start(ctx context.Context) {
	if w == nil || w.db == nil || w.service == nil {
		return
	}

	go func() {
		w.runSweep()

		ticker := time.NewTicker(retentionSweepInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				w.runSweep()
			}
		}
	}()
}

func (w *RetentionWorker) runSweep() {
	retentionDays, err := w.loadRetentionDays()
	if err != nil {
		w.logf("load attachment retention policy: %v", err)
		return
	}

	if _, err := w.service.DeleteExpiredUnreferenced(retentionDays, time.Now().UTC()); err != nil {
		w.logf("delete expired attachments: %v", err)
	}
}

func (w *RetentionWorker) loadRetentionDays() (int, error) {
	var policy models.WorkspacePolicy
	if err := w.db.First(&policy, 1).Error; err != nil {
		return 0, err
	}
	if policy.AttachmentRetentionDays < 1 {
		return 30, nil
	}
	return policy.AttachmentRetentionDays, nil
}

func (w *RetentionWorker) logf(format string, args ...any) {
	if w.logger == nil {
		return
	}
	w.logger.Printf(format, args...)
}
