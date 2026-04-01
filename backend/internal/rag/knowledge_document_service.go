package rag

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

type embedder interface {
	EmbedTexts(ctx context.Context, texts []string, provider ProviderConfig) ([][]float32, error)
	Rerank(ctx context.Context, query string, documents []string, provider ProviderConfig) ([]float32, error)
}

type providerResolver interface {
	ResolveProviderForUser(userID uint) (*ResolvedProvider, error)
}

type KnowledgeDocumentService struct {
	db        *gorm.DB
	spaces    *KnowledgeSpaceService
	providers providerResolver
	embedder  embedder
}

type KnowledgeService = KnowledgeDocumentService

func NewKnowledgeDocumentService(
	db *gorm.DB,
	spaces *KnowledgeSpaceService,
	providers providerResolver,
	embedder embedder,
) *KnowledgeDocumentService {
	if embedder == nil {
		embedder = &noopEmbedder{}
	}
	if spaces == nil {
		spaces = NewKnowledgeSpaceService(db)
	}
	return &KnowledgeDocumentService{
		db:        db,
		spaces:    spaces,
		providers: providers,
		embedder:  embedder,
	}
}

func NewKnowledgeService(db *gorm.DB, providers providerResolver, embedder embedder) *KnowledgeDocumentService {
	return NewKnowledgeDocumentService(db, NewKnowledgeSpaceService(db), providers, embedder)
}

func (s *KnowledgeDocumentService) CreateDocument(
	ctx context.Context,
	userID uint,
	spaceID uint,
	input CreateKnowledgeDocumentInput,
) (*models.KnowledgeDocument, error) {
	documents, err := s.CreateDocumentsBatch(ctx, userID, spaceID, []CreateKnowledgeDocumentInput{input})
	if err != nil {
		return nil, err
	}
	return &documents[0], nil
}

func (s *KnowledgeDocumentService) CreateDocumentsBatch(
	ctx context.Context,
	userID uint,
	spaceID uint,
	inputs []CreateKnowledgeDocumentInput,
) ([]models.KnowledgeDocument, error) {
	if len(inputs) == 0 {
		return []models.KnowledgeDocument{}, nil
	}
	if _, err := s.spaces.getSpace(userID, spaceID); err != nil {
		return nil, err
	}

	provider, err := s.resolveProvider(userID, ProviderConfig{})
	if err != nil {
		return nil, err
	}

	prepared := make([]preparedDocumentIndex, 0, len(inputs))
	documents := make([]models.KnowledgeDocument, 0, len(inputs))
	for _, input := range inputs {
		document := &models.KnowledgeDocument{
			UserID:           userID,
			KnowledgeSpaceID: spaceID,
			Title:            strings.TrimSpace(input.Title),
			SourceType:       normalizeSourceType(input.SourceType),
			SourceURI:        strings.TrimSpace(input.SourceURI),
			MIMEType:         strings.TrimSpace(input.MIMEType),
			Content:          strings.TrimSpace(input.Content),
			Status:           "ready",
		}
		if err := validateDocumentForCreate(document); err != nil {
			return nil, err
		}

		index, err := s.prepareDocumentIndex(ctx, document, provider)
		if err != nil {
			return nil, err
		}
		prepared = append(prepared, index)
		documents = append(documents, *document)
	}

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		for index := range prepared {
			if err := persistPreparedDocumentIndex(tx, &prepared[index], false); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	documents = documents[:0]
	for _, index := range prepared {
		documents = append(documents, *index.document)
	}
	return documents, nil
}

func (s *KnowledgeDocumentService) UpdateDocument(
	ctx context.Context,
	userID uint,
	spaceID uint,
	documentID uint,
	input UpdateKnowledgeDocumentInput,
) (*models.KnowledgeDocument, error) {
	document, err := s.getDocument(userID, spaceID, documentID)
	if err != nil {
		return nil, err
	}

	switch document.SourceType {
	case SourceTypeAttachment:
		if input.Content != nil || input.SourceURI != nil {
			return nil, requestError{message: "attachment documents only support title updates"}
		}
	case SourceTypeText, SourceTypeURL:
	default:
		return nil, requestError{message: "unsupported knowledge document source type"}
	}

	if input.Title != nil {
		document.Title = strings.TrimSpace(*input.Title)
	}
	if input.SourceURI != nil {
		document.SourceURI = strings.TrimSpace(*input.SourceURI)
	}
	if input.Content != nil {
		document.Content = strings.TrimSpace(*input.Content)
	}
	if err := validateDocumentForUpdate(document); err != nil {
		return nil, err
	}

	if document.SourceType == SourceTypeAttachment {
		if err := s.db.Save(document).Error; err != nil {
			return nil, fmt.Errorf("update knowledge document: %w", err)
		}
		return document, nil
	}

	provider, err := s.resolveProvider(userID, ProviderConfig{})
	if err != nil {
		return nil, err
	}
	if err := s.persistDocumentIndex(ctx, document, provider, true); err != nil {
		return nil, err
	}
	return document, nil
}

func (s *KnowledgeDocumentService) ReplaceAttachmentDocument(
	ctx context.Context,
	userID uint,
	spaceID uint,
	documentID uint,
	input ReplaceKnowledgeDocumentFileInput,
) (*models.KnowledgeDocument, error) {
	document, err := s.getDocument(userID, spaceID, documentID)
	if err != nil {
		return nil, err
	}
	if document.SourceType != SourceTypeAttachment {
		return nil, requestError{message: "only attachment documents can replace files"}
	}

	if title := strings.TrimSpace(input.Title); title != "" {
		document.Title = title
	}
	document.MIMEType = strings.TrimSpace(input.MIMEType)
	document.Content = strings.TrimSpace(input.Content)
	if err := validateDocumentForUpdate(document); err != nil {
		return nil, err
	}

	provider, err := s.resolveProvider(userID, ProviderConfig{})
	if err != nil {
		return nil, err
	}
	if err := s.persistDocumentIndex(ctx, document, provider, true); err != nil {
		return nil, err
	}
	return document, nil
}

func (s *KnowledgeDocumentService) DeleteDocument(userID uint, spaceID uint, documentID uint) error {
	if _, err := s.getDocument(userID, spaceID, documentID); err != nil {
		return err
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("knowledge_document_id = ?", documentID).Delete(&models.KnowledgeChunk{}).Error; err != nil {
			return fmt.Errorf("delete knowledge document chunks: %w", err)
		}
		if err := tx.Where("user_id = ? AND knowledge_space_id = ? AND id = ?", userID, spaceID, documentID).
			Delete(&models.KnowledgeDocument{}).Error; err != nil {
			return fmt.Errorf("delete knowledge document: %w", err)
		}
		return nil
	})
}

func (s *KnowledgeDocumentService) ListDocuments(userID uint, spaceID uint) ([]models.KnowledgeDocument, error) {
	if _, err := s.spaces.getSpace(userID, spaceID); err != nil {
		return nil, err
	}

	var documents []models.KnowledgeDocument
	if err := s.db.Where("user_id = ? AND knowledge_space_id = ?", userID, spaceID).
		Order("updated_at desc").
		Find(&documents).Error; err != nil {
		return nil, fmt.Errorf("list knowledge documents: %w", err)
	}
	return documents, nil
}

func (s *KnowledgeDocumentService) Search(
	ctx context.Context,
	userID uint,
	input SearchInput,
	provider ProviderConfig,
) (*SearchResult, error) {
	query := strings.TrimSpace(input.Query)
	if query == "" {
		return &SearchResult{}, nil
	}
	spaceIDs := input.KnowledgeSpaceIDs
	if len(spaceIDs) == 0 {
		return &SearchResult{}, nil
	}
	var count int64
	if err := s.db.Model(&models.KnowledgeSpace{}).
		Where("user_id = ? AND id IN ?", userID, spaceIDs).
		Count(&count).Error; err != nil {
		return nil, fmt.Errorf("validate knowledge spaces: %w", err)
	}
	if count != int64(len(spaceIDs)) {
		return nil, gorm.ErrRecordNotFound
	}

	resolvedProvider, err := s.resolveProvider(userID, provider)
	if err != nil {
		return nil, err
	}
	queryVectors, err := s.embedder.EmbedTexts(ctx, []string{query}, resolvedProvider)
	if err != nil || len(queryVectors) == 0 {
		return nil, fmt.Errorf("embed search query: %w", err)
	}

	var chunks []models.KnowledgeChunk
	if err := s.db.Where("user_id = ? AND knowledge_space_id IN ?", userID, spaceIDs).
		Order("knowledge_document_id asc, position asc").
		Find(&chunks).Error; err != nil {
		return nil, fmt.Errorf("list knowledge chunks: %w", err)
	}

	type candidate struct {
		Chunk models.KnowledgeChunk
		Score float32
	}

	candidates := make([]candidate, 0, len(chunks))
	for _, chunk := range chunks {
		candidates = append(candidates, candidate{
			Chunk: chunk,
			Score: cosineSimilarity(queryVectors[0], chunk.Vector),
		})
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Score > candidates[j].Score
	})
	if len(candidates) > 24 {
		candidates = candidates[:24]
	}
	if len(candidates) == 0 {
		return &SearchResult{}, nil
	}

	documentIDs := make([]uint, 0, len(candidates))
	seenDocs := map[uint]struct{}{}
	for _, candidate := range candidates {
		if _, exists := seenDocs[candidate.Chunk.KnowledgeDocumentID]; exists {
			continue
		}
		seenDocs[candidate.Chunk.KnowledgeDocumentID] = struct{}{}
		documentIDs = append(documentIDs, candidate.Chunk.KnowledgeDocumentID)
	}
	var documents []models.KnowledgeDocument
	if err := s.db.Where("id IN ?", documentIDs).Find(&documents).Error; err != nil {
		return nil, fmt.Errorf("load knowledge documents: %w", err)
	}
	documentMap := mapDocumentsByID(documents)

	docTexts := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		docTexts = append(docTexts, candidate.Chunk.Content)
	}
	rerankScores, err := s.embedder.Rerank(ctx, query, docTexts, resolvedProvider)
	if err == nil && len(rerankScores) == len(candidates) {
		for index := range candidates {
			candidates[index].Score = rerankScores[index]
		}
		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].Score > candidates[j].Score
		})
	}

	limit := input.MaxResults
	if limit <= 0 || limit > 6 {
		limit = 6
	}
	if len(candidates) > limit {
		candidates = candidates[:limit]
	}

	result := &SearchResult{
		Citations:     make([]models.AgentCitation, 0, len(candidates)),
		ContextBlocks: make([]string, 0, len(candidates)),
	}
	for _, candidate := range candidates {
		document := documentMap[candidate.Chunk.KnowledgeDocumentID]
		result.Citations = append(result.Citations, models.AgentCitation{
			DocumentID:   document.ID,
			DocumentName: document.Title,
			ChunkID:      candidate.Chunk.ID,
			Snippet:      candidate.Chunk.Content,
			SourceURI:    document.SourceURI,
		})
		result.ContextBlocks = append(result.ContextBlocks, candidate.Chunk.Content)
	}
	return result, nil
}

func (s *KnowledgeDocumentService) getDocument(userID uint, spaceID uint, documentID uint) (*models.KnowledgeDocument, error) {
	if _, err := s.spaces.getSpace(userID, spaceID); err != nil {
		return nil, err
	}

	var document models.KnowledgeDocument
	if err := s.db.Where(
		"id = ? AND user_id = ? AND knowledge_space_id = ?",
		documentID,
		userID,
		spaceID,
	).First(&document).Error; err != nil {
		return nil, err
	}
	return &document, nil
}

func (s *KnowledgeDocumentService) persistDocumentIndex(
	ctx context.Context,
	document *models.KnowledgeDocument,
	provider ProviderConfig,
	replaceExisting bool,
) error {
	index, err := s.prepareDocumentIndex(ctx, document, provider)
	if err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		return persistPreparedDocumentIndex(tx, &index, replaceExisting)
	})
}

type preparedDocumentIndex struct {
	document *models.KnowledgeDocument
	chunks   []string
	vectors  [][]float32
}

func (s *KnowledgeDocumentService) prepareDocumentIndex(
	ctx context.Context,
	document *models.KnowledgeDocument,
	provider ProviderConfig,
) (preparedDocumentIndex, error) {
	chunks := chunkText(document.Content)
	vectors, err := s.embedder.EmbedTexts(ctx, chunks, provider)
	if err != nil {
		return preparedDocumentIndex{}, fmt.Errorf("embed knowledge chunks: %w", err)
	}

	now := time.Now().UTC()
	document.ChunkCount = len(chunks)
	document.LastIndexedAt = &now
	document.Status = "ready"

	return preparedDocumentIndex{
		document: document,
		chunks:   chunks,
		vectors:  vectors,
	}, nil
}

func persistPreparedDocumentIndex(
	tx *gorm.DB,
	index *preparedDocumentIndex,
	replaceExisting bool,
) error {
	document := index.document
	if replaceExisting {
		if err := tx.Where("knowledge_document_id = ?", document.ID).Delete(&models.KnowledgeChunk{}).Error; err != nil {
			return fmt.Errorf("delete knowledge chunks: %w", err)
		}
		if err := tx.Save(document).Error; err != nil {
			return fmt.Errorf("update knowledge document: %w", err)
		}
	} else if err := tx.Create(document).Error; err != nil {
		return fmt.Errorf("create knowledge document: %w", err)
	}

	chunkRows := make([]models.KnowledgeChunk, 0, len(index.chunks))
	for position, chunk := range index.chunks {
		vector := []float32{}
		if position < len(index.vectors) {
			vector = index.vectors[position]
		}
		chunkRows = append(chunkRows, models.KnowledgeChunk{
			UserID:              document.UserID,
			KnowledgeSpaceID:    document.KnowledgeSpaceID,
			KnowledgeDocumentID: document.ID,
			Position:            position,
			Content:             chunk,
			Vector:              vector,
		})
	}
	if len(chunkRows) == 0 {
		return nil
	}
	if err := tx.Create(&chunkRows).Error; err != nil {
		return fmt.Errorf("create knowledge chunks: %w", err)
	}
	return nil
}

func (s *KnowledgeDocumentService) resolveProvider(userID uint, override ProviderConfig) (ProviderConfig, error) {
	if override.BaseURL != "" || override.APIKey != "" || override.EmbeddingModel != "" || override.RerankerModel != "" {
		return override, nil
	}
	if s.providers == nil {
		return ProviderConfig{}, nil
	}
	resolved, err := s.providers.ResolveProviderForUser(userID)
	if err != nil {
		return ProviderConfig{}, fmt.Errorf("resolve rag provider: %w", err)
	}
	return resolved.Config, nil
}

func normalizeSourceType(sourceType string) string {
	if trimmed := strings.TrimSpace(sourceType); trimmed != "" {
		return trimmed
	}
	return SourceTypeText
}

func validateDocumentForCreate(document *models.KnowledgeDocument) error {
	if document.Title == "" {
		return requestError{message: "knowledge document title is required"}
	}
	if document.Content == "" {
		return requestError{message: "knowledge document content is required"}
	}
	return nil
}

func validateDocumentForUpdate(document *models.KnowledgeDocument) error {
	if document.Title == "" {
		return requestError{message: "knowledge document title is required"}
	}
	switch document.SourceType {
	case SourceTypeText, SourceTypeURL, SourceTypeAttachment:
	default:
		return requestError{message: "unsupported knowledge document source type"}
	}
	if document.Content == "" {
		return requestError{message: "knowledge document content is required"}
	}
	return nil
}

func mapDocumentsByID(documents []models.KnowledgeDocument) map[uint]models.KnowledgeDocument {
	documentMap := make(map[uint]models.KnowledgeDocument, len(documents))
	for _, document := range documents {
		documentMap[document.ID] = document
	}
	return documentMap
}
