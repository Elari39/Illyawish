package auth

import (
	"errors"
	"strings"
)

func sanitizeCredentials(username string, password string) (string, string, error) {
	normalizedUsername := strings.TrimSpace(username)
	if normalizedUsername == "" {
		return "", "", errors.New("username is required")
	}
	if len(normalizedUsername) > 64 {
		return "", "", errors.New("username must be 64 characters or fewer")
	}

	normalizedPassword := strings.TrimSpace(password)
	if normalizedPassword == "" {
		return "", "", errors.New("password is required")
	}
	if len(normalizedPassword) < 8 {
		return "", "", errors.New("password must be at least 8 characters long")
	}

	return normalizedUsername, normalizedPassword, nil
}
