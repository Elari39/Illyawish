package provider

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

type apiKeyCrypter struct {
	gcm cipher.AEAD
}

func newAPIKeyCrypter(secret string) (*apiKeyCrypter, error) {
	normalizedSecret := strings.TrimSpace(secret)
	if normalizedSecret == "" {
		return nil, errors.New("settings encryption secret is required")
	}

	key := sha256.Sum256([]byte(normalizedSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM cipher: %w", err)
	}

	return &apiKeyCrypter{gcm: gcm}, nil
}

func (c *apiKeyCrypter) Encrypt(value string) (string, error) {
	nonce := make([]byte, c.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := c.gcm.Seal(nil, nonce, []byte(value), nil)
	payload := append(nonce, ciphertext...)
	return base64.StdEncoding.EncodeToString(payload), nil
}

func (c *apiKeyCrypter) Decrypt(value string) (string, error) {
	payload, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	nonceSize := c.gcm.NonceSize()
	if len(payload) < nonceSize {
		return "", errors.New("ciphertext is too short")
	}

	nonce := payload[:nonceSize]
	ciphertext := payload[nonceSize:]
	plaintext, err := c.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt ciphertext: %w", err)
	}

	return string(plaintext), nil
}
