package models

import "time"

type AgentCitation struct {
	DocumentID   uint   `json:"documentId"`
	DocumentName string `json:"documentName"`
	ChunkID      uint   `json:"chunkId"`
	Snippet      string `json:"snippet"`
	SourceURI    string `json:"sourceUri"`
}

type AgentToolCallSummary struct {
	ToolName      string `json:"toolName"`
	Status        string `json:"status"`
	InputSummary  string `json:"inputSummary"`
	OutputSummary string `json:"outputSummary"`
}

type AgentRunSummary struct {
	WorkflowTemplateKey string                 `json:"workflowTemplateKey"`
	WorkflowPresetID    *uint                  `json:"workflowPresetId,omitempty"`
	KnowledgeSpaceIDs   []uint                 `json:"knowledgeSpaceIds"`
	ToolCalls           []AgentToolCallSummary `json:"toolCalls"`
	Citations           []AgentCitation        `json:"citations"`
}

type RAGProviderPreset struct {
	ID                   uint   `gorm:"primaryKey"`
	UserID               uint   `gorm:"not null;index;uniqueIndex:idx_rag_provider_active_per_user,priority:1,where:is_active = 1"`
	Name                 string `gorm:"size:120;not null"`
	BaseURL              string `gorm:"size:512;not null"`
	EncryptedAPIKey      string `gorm:"type:text;not null"`
	APIKeyHint           string `gorm:"size:64;not null"`
	EmbeddingModel       string `gorm:"size:160;not null"`
	RerankerModel        string `gorm:"size:160;not null"`
	IsActive             bool   `gorm:"not null;default:false;uniqueIndex:idx_rag_provider_active_per_user,priority:2,where:is_active = 1"`
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type KnowledgeSpace struct {
	ID          uint   `gorm:"primaryKey"`
	UserID      uint   `gorm:"not null;index"`
	Name        string `gorm:"size:160;not null"`
	Description string `gorm:"type:text;not null;default:''"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Documents   []KnowledgeDocument
}

type KnowledgeDocument struct {
	ID               uint   `gorm:"primaryKey"`
	UserID           uint   `gorm:"not null;index"`
	KnowledgeSpaceID uint   `gorm:"not null;index"`
	Title            string `gorm:"size:255;not null"`
	SourceType       string `gorm:"size:32;not null"`
	SourceURI        string `gorm:"size:1024;not null;default:''"`
	MIMEType         string `gorm:"size:128;not null;default:''"`
	Content          string `gorm:"type:text;not null"`
	Status           string `gorm:"size:32;not null;default:ready"`
	ChunkCount       int    `gorm:"not null;default:0"`
	LastIndexedAt    *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Chunks           []KnowledgeChunk `gorm:"foreignKey:KnowledgeDocumentID;constraint:OnDelete:CASCADE"`
}

type KnowledgeChunk struct {
	ID                  uint      `gorm:"primaryKey"`
	UserID              uint      `gorm:"not null;index"`
	KnowledgeSpaceID    uint      `gorm:"not null;index"`
	KnowledgeDocumentID uint      `gorm:"not null;index"`
	Position            int       `gorm:"not null"`
	Content             string    `gorm:"type:text;not null"`
	Vector              []float32 `gorm:"serializer:json;type:text"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type WorkflowPreset struct {
	ID               uint            `gorm:"primaryKey"`
	UserID           uint            `gorm:"not null;index"`
	Name             string          `gorm:"size:160;not null"`
	TemplateKey      string          `gorm:"size:120;not null"`
	DefaultInputs    map[string]any  `gorm:"serializer:json;type:text"`
	KnowledgeSpaceIDs []uint         `gorm:"serializer:json;type:text"`
	ToolEnablements  map[string]bool `gorm:"serializer:json;type:text"`
	OutputMode       string          `gorm:"size:64;not null;default:'default'"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}
