package admin

import (
	"errors"
	"fmt"
	"strings"

	"backend/internal/models"

	"gorm.io/gorm"
)

type requestError struct {
	message string
	code    string
}

func (e requestError) Error() string {
	return e.message
}

func (e requestError) Code() string {
	return e.code
}

func IsRequestError(err error) bool {
	var target requestError
	return errors.As(err, &target)
}

func RequestErrorCode(err error) string {
	var target requestError
	if errors.As(err, &target) {
		return target.code
	}
	return ""
}

func sanitizeRole(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case models.UserRoleAdmin, models.UserRoleMember:
		return strings.TrimSpace(value), nil
	default:
		return "", requestError{message: "role must be admin or member", code: "validation_failed"}
	}
}

func sanitizeStatus(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case models.UserStatusActive, models.UserStatusDisabled:
		return strings.TrimSpace(value), nil
	default:
		return "", requestError{message: "status must be active or disabled", code: "validation_failed"}
	}
}

func sanitizeOptionalPositiveInt(value *int, label string) (*int, error) {
	if value == nil {
		return nil, nil
	}
	if *value <= 0 {
		return nil, requestError{message: fmt.Sprintf("%s must be greater than 0", label), code: "validation_failed"}
	}
	cloned := *value
	return &cloned, nil
}

func sanitizeRequiredPositiveInt(value int, label string) (int, error) {
	if value <= 0 {
		return 0, requestError{message: fmt.Sprintf("%s must be greater than 0", label), code: "validation_failed"}
	}
	return value, nil
}

func coalesceIntPointer(primary *int, fallback *int) *int {
	if primary != nil {
		return primary
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func isDuplicateUsernameError(err error) bool {
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}

	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "unique constraint failed") &&
		strings.Contains(message, "users.username")
}
