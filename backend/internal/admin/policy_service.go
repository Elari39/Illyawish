package admin

import (
	"fmt"
	"strings"

	"backend/internal/models"
)

func (s *Service) GetWorkspacePolicy() (*models.WorkspacePolicy, error) {
	var policy models.WorkspacePolicy
	if err := s.db.First(&policy, 1).Error; err != nil {
		return nil, fmt.Errorf("load workspace policy: %w", err)
	}
	if strings.TrimSpace(policy.DefaultUserRole) == "" {
		policy.DefaultUserRole = models.UserRoleMember
	}
	return &policy, nil
}

func (s *Service) UpdateWorkspacePolicy(actor *models.User, input WorkspacePolicyInput) (*models.WorkspacePolicy, error) {
	policy, err := s.GetWorkspacePolicy()
	if err != nil {
		return nil, err
	}

	role, err := sanitizeRole(strings.TrimSpace(input.DefaultUserRole))
	if err != nil {
		return nil, err
	}
	maxConversations, err := sanitizeOptionalPositiveInt(input.DefaultUserMaxConversations, "default max conversations")
	if err != nil {
		return nil, err
	}
	maxAttachments, err := sanitizeOptionalPositiveInt(input.DefaultUserMaxAttachmentsPerMsg, "default max attachments per message")
	if err != nil {
		return nil, err
	}
	dailyMessageLimit, err := sanitizeOptionalPositiveInt(input.DefaultUserDailyMessageLimit, "default daily message limit")
	if err != nil {
		return nil, err
	}

	policy.DefaultUserRole = role
	policy.DefaultUserMaxConversations = maxConversations
	policy.DefaultUserMaxAttachmentsPerMsg = maxAttachments
	policy.DefaultUserDailyMessageLimit = dailyMessageLimit
	if err := s.db.Model(policy).Updates(map[string]any{
		"default_user_role":                    policy.DefaultUserRole,
		"default_user_max_conversations":       policy.DefaultUserMaxConversations,
		"default_user_max_attachments_per_msg": policy.DefaultUserMaxAttachmentsPerMsg,
		"default_user_daily_message_limit":     policy.DefaultUserDailyMessageLimit,
	}).Error; err != nil {
		return nil, fmt.Errorf("update workspace policy: %w", err)
	}

	if s.audit != nil {
		_ = s.audit.Record(actor, "admin.workspace_policy_updated", "workspace_policy", "1", "workspace", "Updated workspace defaults")
	}
	return policy, nil
}
