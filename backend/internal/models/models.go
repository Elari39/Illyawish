package models

import "time"

const (
	RoleSystem    = "system"
	RoleUser      = "user"
	RoleAssistant = "assistant"

	MessageStatusCompleted = "completed"
	MessageStatusStreaming = "streaming"
	MessageStatusFailed    = "failed"
	MessageStatusCancelled = "cancelled"
)

type Attachment struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MIMEType string `json:"mimeType"`
	URL      string `json:"url"`
	Size     int64  `json:"size"`
}

type User struct {
	ID            uint   `gorm:"primaryKey"`
	Username      string `gorm:"uniqueIndex;size:64;not null"`
	PasswordHash  string `gorm:"size:255;not null"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
	Conversations []Conversation
}

type Conversation struct {
	ID           uint   `gorm:"primaryKey"`
	UserID       uint   `gorm:"index;not null"`
	Title        string `gorm:"size:255;not null;default:New chat"`
	IsPinned     bool   `gorm:"not null;default:false"`
	IsArchived   bool   `gorm:"not null;default:false"`
	SystemPrompt string `gorm:"type:text;not null;default:''"`
	Model        string `gorm:"size:128;not null;default:''"`
	Temperature  *float32
	MaxTokens    *int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Messages     []Message
}

type Message struct {
	ID             uint         `gorm:"primaryKey"`
	ConversationID uint         `gorm:"index;not null"`
	Role           string       `gorm:"size:32;not null"`
	Content        string       `gorm:"type:text;not null"`
	Attachments    []Attachment `gorm:"serializer:json"`
	Status         string       `gorm:"size:32;not null;default:completed"`
	CreatedAt      time.Time
}
