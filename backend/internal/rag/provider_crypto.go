package rag

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"strings"
)

type apiKeyCrypter struct {
	block cipher.Block
}

func newAPIKeyCrypter(secret string) (*apiKeyCrypter, error) {
	trimmed := strings.TrimSpace(secret)
	if trimmed == "" {
		return nil, errors.New("encryption secret is required")
	}
	key := sha256.Sum256([]byte(trimmed))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return &apiKeyCrypter{block: block}, nil
}

func (c *apiKeyCrypter) Encrypt(value string) (string, error) {
	plaintext := []byte(strings.TrimSpace(value))
	gcm, err := cipher.NewGCM(c.block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (c *apiKeyCrypter) Decrypt(value string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(c.block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func apiKeyHint(apiKey string) string {
	trimmed := strings.TrimSpace(apiKey)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) <= 6 {
		return "••••••"
	}
	return trimmed[:3] + "..." + trimmed[len(trimmed)-3:]
}
