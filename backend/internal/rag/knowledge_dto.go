package rag

import "backend/internal/models"

type knowledgeSpaceDTO struct {
	ID          uint   `json:"id"`
	UserID      uint   `json:"userId"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type knowledgeDocumentDTO struct {
	ID               uint    `json:"id"`
	UserID           uint    `json:"userId"`
	KnowledgeSpaceID uint    `json:"knowledgeSpaceId"`
	Title            string  `json:"title"`
	SourceType       string  `json:"sourceType"`
	SourceURI        string  `json:"sourceUri"`
	MIMEType         string  `json:"mimeType"`
	Content          string  `json:"content"`
	Status           string  `json:"status"`
	ChunkCount       int     `json:"chunkCount"`
	LastIndexedAt    *string `json:"lastIndexedAt"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
}

func toKnowledgeSpaceDTO(space models.KnowledgeSpace) knowledgeSpaceDTO {
	return knowledgeSpaceDTO{
		ID:          space.ID,
		UserID:      space.UserID,
		Name:        space.Name,
		Description: space.Description,
		CreatedAt:   space.CreatedAt.UTC().Format(timestampLayout),
		UpdatedAt:   space.UpdatedAt.UTC().Format(timestampLayout),
	}
}

func toKnowledgeSpaceDTOs(spaces []models.KnowledgeSpace) []knowledgeSpaceDTO {
	items := make([]knowledgeSpaceDTO, 0, len(spaces))
	for _, space := range spaces {
		items = append(items, toKnowledgeSpaceDTO(space))
	}
	return items
}

func toKnowledgeDocumentDTO(document models.KnowledgeDocument) knowledgeDocumentDTO {
	var lastIndexedAt *string
	if document.LastIndexedAt != nil {
		value := document.LastIndexedAt.UTC().Format(timestampLayout)
		lastIndexedAt = &value
	}

	return knowledgeDocumentDTO{
		ID:               document.ID,
		UserID:           document.UserID,
		KnowledgeSpaceID: document.KnowledgeSpaceID,
		Title:            document.Title,
		SourceType:       document.SourceType,
		SourceURI:        document.SourceURI,
		MIMEType:         document.MIMEType,
		Content:          document.Content,
		Status:           document.Status,
		ChunkCount:       document.ChunkCount,
		LastIndexedAt:    lastIndexedAt,
		CreatedAt:        document.CreatedAt.UTC().Format(timestampLayout),
		UpdatedAt:        document.UpdatedAt.UTC().Format(timestampLayout),
	}
}

func toKnowledgeDocumentDTOs(documents []models.KnowledgeDocument) []knowledgeDocumentDTO {
	items := make([]knowledgeDocumentDTO, 0, len(documents))
	for _, document := range documents {
		items = append(items, toKnowledgeDocumentDTO(document))
	}
	return items
}
