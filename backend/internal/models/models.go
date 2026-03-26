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

type StoredAttachment struct {
	ID         string `gorm:"primaryKey;size:64"`
	UserID     uint   `gorm:"index;not null"`
	Name       string `gorm:"size:255;not null"`
	MIMEType   string `gorm:"size:128;not null"`
	Size       int64  `gorm:"not null"`
	StorageKey string `gorm:"size:255;not null;uniqueIndex"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type User struct {
	ID                 uint   `gorm:"primaryKey"`
	Username           string `gorm:"uniqueIndex;size:64;not null"`
	PasswordHash       string `gorm:"size:255;not null"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
	Conversations      []Conversation
	LLMProviderPresets []LLMProviderPreset
	Attachments        []StoredAttachment
}

type Conversation struct {
	ID           uint   `gorm:"primaryKey"`
	UserID       uint   `gorm:"not null;index:idx_conversations_user_view,priority:1"`
	Title        string `gorm:"size:255;not null;default:New chat"`
	IsPinned     bool   `gorm:"not null;default:false;index:idx_conversations_user_view,priority:3"`
	IsArchived   bool   `gorm:"not null;default:false;index:idx_conversations_user_view,priority:2"`
	SystemPrompt string `gorm:"type:text;not null;default:''"`
	Model        string `gorm:"size:128;not null;default:''"`
	Temperature  *float32
	MaxTokens    *int
	CreatedAt    time.Time
	UpdatedAt    time.Time `gorm:"index:idx_conversations_user_view,priority:4"`
	Messages     []Message
}

type Message struct {
	ID                uint                `gorm:"primaryKey"`
	ConversationID    uint                `gorm:"index;not null"`
	Role              string              `gorm:"size:32;not null"`
	Content           string              `gorm:"type:text;not null"`
	LegacyAttachments []Attachment        `gorm:"serializer:json;column:attachments" json:"-"`
	Attachments       []Attachment        `gorm:"-" json:"attachments"`
	AttachmentLinks   []MessageAttachment `gorm:"foreignKey:MessageID;constraint:OnDelete:CASCADE" json:"-"`
	Status            string              `gorm:"size:32;not null;default:completed"`
	CreatedAt         time.Time
}

type MessageAttachment struct {
	MessageID    uint             `gorm:"primaryKey;autoIncrement:false"`
	AttachmentID string           `gorm:"primaryKey;size:64"`
	Position     int              `gorm:"not null;default:0"`
	Attachment   StoredAttachment `gorm:"foreignKey:AttachmentID;references:ID;constraint:OnDelete:CASCADE"`
	CreatedAt    time.Time
}

type LLMProviderPreset struct {
	ID              uint     `gorm:"primaryKey"`
	UserID          uint     `gorm:"not null;index;uniqueIndex:idx_provider_active_per_user,priority:1,where:is_active = 1"`
	Name            string   `gorm:"size:120;not null"`
	BaseURL         string   `gorm:"size:512;not null"`
	EncryptedAPIKey string   `gorm:"type:text;not null"`
	APIKeyHint      string   `gorm:"size:64;not null"`
	Models          []string `gorm:"serializer:json"`
	DefaultModel    string   `gorm:"size:128;not null"`
	IsActive        bool     `gorm:"not null;default:false;uniqueIndex:idx_provider_active_per_user,priority:2,where:is_active = 1"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}
