package admin

import (
	"strconv"

	"backend/internal/models"
)

func (s *Service) recordAudit(actor *models.User, action string, target *models.User, summary string) {
	if s.audit == nil {
		return
	}

	targetID := ""
	targetName := ""
	if target != nil {
		targetID = strconv.FormatUint(uint64(target.ID), 10)
		targetName = target.Username
	}
	_ = s.audit.Record(actor, action, "user", targetID, targetName, summary)
}
