package rag

import "backend/internal/models"

const (
	SourceTypeText       = "text"
	SourceTypeURL        = "url"
	SourceTypeAttachment = "attachment"
)

type CreateKnowledgeSpaceInput struct {
	Name        string
	Description string
}

type UpdateKnowledgeSpaceInput struct {
	Name        *string
	Description *string
}

type CreateKnowledgeDocumentInput struct {
	Title      string
	SourceType string
	SourceURI  string
	MIMEType   string
	Content    string
}

type UpdateKnowledgeDocumentInput struct {
	Title     *string
	SourceURI *string
	Content   *string
}

type ReplaceKnowledgeDocumentFileInput struct {
	Title    string
	MIMEType string
	Content  string
}

type SearchInput struct {
	Query             string
	KnowledgeSpaceIDs []uint
	MaxResults        int
}

type SearchResult struct {
	Citations     []models.AgentCitation
	ContextBlocks []string
}
