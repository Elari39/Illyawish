package provider

import (
	"net/url"
	"strings"
)

func normalizeBaseURL(value string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(value), "/")
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}

	return parsed.String()
}

func apiKeyHint(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	runes := []rune(trimmed)
	if len(runes) <= 8 {
		return string(runes[0]) + "***" + string(runes[len(runes)-1])
	}

	return string(runes[:4]) + "..." + string(runes[len(runes)-4:])
}
