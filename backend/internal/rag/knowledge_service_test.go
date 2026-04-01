package rag

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"backend/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type fakeEmbedder struct{}

type fakeProviderResolver struct {
	resolved *ResolvedProvider
}

func (f *fakeProviderResolver) ResolveProviderForUser(uint) (*ResolvedProvider, error) {
	return f.resolved, nil
}

func vectorForText(text string) []float32 {
	lowered := strings.ToLower(text)
	return []float32{
		float32(strings.Count(lowered, "embedding")),
		float32(strings.Count(lowered, "rerank")),
		float32(len(lowered)),
	}
}

func containsWord(document string, query string) bool {
	return strings.Contains(strings.ToLower(document), strings.ToLower(query))
}

func (f *fakeEmbedder) EmbedTexts(_ context.Context, texts []string, _ ProviderConfig) ([][]float32, error) {
	result := make([][]float32, 0, len(texts))
	for _, text := range texts {
		result = append(result, vectorForText(text))
	}
	return result, nil
}

func (f *fakeEmbedder) Rerank(_ context.Context, query string, documents []string, _ ProviderConfig) ([]float32, error) {
	scores := make([]float32, 0, len(documents))
	for _, document := range documents {
		score := float32(0)
		if containsWord(document, query) {
			score = 10
		}
		scores = append(scores, score)
	}
	return scores, nil
}

type recordingEmbedder struct {
	lastProvider ProviderConfig
}

func (f *recordingEmbedder) EmbedTexts(_ context.Context, texts []string, provider ProviderConfig) ([][]float32, error) {
	f.lastProvider = provider
	result := make([][]float32, 0, len(texts))
	for range texts {
		result = append(result, []float32{1, 0, 0})
	}
	return result, nil
}

func (f *recordingEmbedder) Rerank(_ context.Context, _ string, documents []string, provider ProviderConfig) ([]float32, error) {
	f.lastProvider = provider
	result := make([]float32, 0, len(documents))
	for range documents {
		result = append(result, 1)
	}
	return result, nil
}

func TestKnowledgeSpaceServiceListsSpacesPerUser(t *testing.T) {
	service, _ := newKnowledgeTestServices(t)

	if _, err := service.CreateSpace(1, CreateKnowledgeSpaceInput{Name: "User 1 Space"}); err != nil {
		t.Fatalf("CreateSpace(user1) error = %v", err)
	}
	if _, err := service.CreateSpace(2, CreateKnowledgeSpaceInput{Name: "User 2 Space"}); err != nil {
		t.Fatalf("CreateSpace(user2) error = %v", err)
	}

	spaces, err := service.ListSpaces(1)
	if err != nil {
		t.Fatalf("ListSpaces() error = %v", err)
	}
	if len(spaces) != 1 || spaces[0].Name != "User 1 Space" {
		t.Fatalf("expected only user 1 spaces, got %#v", spaces)
	}
}

func TestKnowledgeDocumentServiceIndexesDocumentAndReturnsRankedCitations(t *testing.T) {
	spaceService, documentService := newKnowledgeTestServices(t)

	space, err := spaceService.CreateSpace(1, CreateKnowledgeSpaceInput{Name: "Docs"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	if _, err := documentService.CreateDocument(context.Background(), 1, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Alpha",
		SourceType: SourceTypeText,
		Content:    "Qwen embedding model notes.\nThis document explains embeddings.",
	}); err != nil {
		t.Fatalf("CreateDocument(alpha) error = %v", err)
	}
	if _, err := documentService.CreateDocument(context.Background(), 1, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Beta",
		SourceType: SourceTypeText,
		Content:    "Reranking examples and retrieval pipeline details.",
	}); err != nil {
		t.Fatalf("CreateDocument(beta) error = %v", err)
	}

	results, err := documentService.Search(context.Background(), 1, SearchInput{
		Query:             "embedding",
		KnowledgeSpaceIDs: []uint{space.ID},
		MaxResults:        3,
	}, ProviderConfig{})
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(results.Citations) == 0 {
		t.Fatal("expected at least one citation")
	}
	if results.Citations[0].DocumentName != "Alpha" {
		t.Fatalf("expected alpha document to rank first, got %#v", results.Citations)
	}
	if len(results.ContextBlocks) == 0 {
		t.Fatal("expected context blocks to be returned")
	}
}

func TestKnowledgeDocumentServiceRejectsCrossUserSpaceAccess(t *testing.T) {
	spaceService, documentService := newKnowledgeTestServices(t)

	space, err := spaceService.CreateSpace(1, CreateKnowledgeSpaceInput{Name: "Private"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	if _, err := documentService.CreateDocument(context.Background(), 2, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Invalid",
		SourceType: SourceTypeText,
		Content:    "should fail",
	}); err == nil {
		t.Fatal("expected cross-user access to fail")
	}
}

func TestKnowledgeDocumentServiceResolvesActiveProviderForIndexingAndSearch(t *testing.T) {
	db := newKnowledgeTestDB(t)
	embedder := &recordingEmbedder{}
	spaceService := NewKnowledgeSpaceService(db)
	service := NewKnowledgeDocumentService(db, spaceService, &fakeProviderResolver{
		resolved: &ResolvedProvider{
			Config: ProviderConfig{
				BaseURL:        "https://api.siliconflow.cn/v1",
				APIKey:         "workspace-key",
				EmbeddingModel: "Qwen/Qwen3-Embedding-8B",
				RerankerModel:  "Qwen/Qwen3-Reranker-8B",
			},
		},
	}, embedder)

	space, err := spaceService.CreateSpace(1, CreateKnowledgeSpaceInput{Name: "Docs"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	if _, err := service.CreateDocument(context.Background(), 1, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Alpha",
		SourceType: SourceTypeText,
		Content:    "Embedding details",
	}); err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}
	if embedder.lastProvider.EmbeddingModel != "Qwen/Qwen3-Embedding-8B" {
		t.Fatalf("expected indexing to use resolved embedding model, got %#v", embedder.lastProvider)
	}

	if _, err := service.Search(context.Background(), 1, SearchInput{
		Query:             "embedding",
		KnowledgeSpaceIDs: []uint{space.ID},
		MaxResults:        1,
	}, ProviderConfig{}); err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if embedder.lastProvider.RerankerModel != "Qwen/Qwen3-Reranker-8B" {
		t.Fatalf("expected search to use resolved reranker model, got %#v", embedder.lastProvider)
	}
}

func TestKnowledgeSpaceServiceUpdatesSpace(t *testing.T) {
	spaceService, _ := newKnowledgeTestServices(t)

	space, err := spaceService.CreateSpace(9, CreateKnowledgeSpaceInput{
		Name:        "Initial",
		Description: "Before",
	})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	updated, err := spaceService.UpdateSpace(9, space.ID, UpdateKnowledgeSpaceInput{
		Name:        ptrTo("Renamed"),
		Description: ptrTo("After"),
	})
	if err != nil {
		t.Fatalf("UpdateSpace() error = %v", err)
	}
	if updated.Name != "Renamed" || updated.Description != "After" {
		t.Fatalf("expected updated space values, got %#v", updated)
	}
}

func TestKnowledgeSpaceServiceDeletesSpaceAndCleansReferences(t *testing.T) {
	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})

	space, err := spaceService.CreateSpace(3, CreateKnowledgeSpaceInput{Name: "Engineering"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	if _, err := documentService.CreateDocument(context.Background(), 3, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Doc",
		SourceType: SourceTypeText,
		Content:    "hello knowledge",
	}); err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}

	conversation := &models.Conversation{
		UserID:            3,
		Title:             "Chat",
		KnowledgeSpaceIDs: []uint{space.ID, 99},
	}
	if err := db.Create(conversation).Error; err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	if err := spaceService.DeleteSpace(3, space.ID); err != nil {
		t.Fatalf("DeleteSpace() error = %v", err)
	}

	var documentCount int64
	if err := db.Model(&models.KnowledgeDocument{}).Where("knowledge_space_id = ?", space.ID).Count(&documentCount).Error; err != nil {
		t.Fatalf("count documents: %v", err)
	}
	if documentCount != 0 {
		t.Fatalf("expected documents deleted, got %d", documentCount)
	}

	var chunkCount int64
	if err := db.Model(&models.KnowledgeChunk{}).Where("knowledge_space_id = ?", space.ID).Count(&chunkCount).Error; err != nil {
		t.Fatalf("count chunks: %v", err)
	}
	if chunkCount != 0 {
		t.Fatalf("expected chunks deleted, got %d", chunkCount)
	}

	var reloadedConversation models.Conversation
	if err := db.First(&reloadedConversation, conversation.ID).Error; err != nil {
		t.Fatalf("reload conversation: %v", err)
	}
	if len(reloadedConversation.KnowledgeSpaceIDs) != 1 || reloadedConversation.KnowledgeSpaceIDs[0] != 99 {
		t.Fatalf("expected deleted space removed from conversation, got %#v", reloadedConversation.KnowledgeSpaceIDs)
	}
}

func TestKnowledgeDocumentServiceUpdatesTextDocumentAndReindexes(t *testing.T) {
	spaceService, documentService := newKnowledgeTestServices(t)

	space, err := spaceService.CreateSpace(1, CreateKnowledgeSpaceInput{Name: "Docs"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	document, err := documentService.CreateDocument(context.Background(), 1, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Original",
		SourceType: SourceTypeText,
		Content:    "alpha",
	})
	if err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}
	originalIndexedAt := document.LastIndexedAt

	updated, err := documentService.UpdateDocument(context.Background(), 1, space.ID, document.ID, UpdateKnowledgeDocumentInput{
		Title:   ptrTo("Updated"),
		Content: ptrTo("beta beta beta"),
	})
	if err != nil {
		t.Fatalf("UpdateDocument() error = %v", err)
	}
	if updated.ID != document.ID {
		t.Fatalf("expected document ID to stay the same, got %d want %d", updated.ID, document.ID)
	}
	if updated.Title != "Updated" || updated.Content != "beta beta beta" {
		t.Fatalf("expected updated document content, got %#v", updated)
	}
	if updated.LastIndexedAt == nil || (originalIndexedAt != nil && !updated.LastIndexedAt.After(*originalIndexedAt)) {
		t.Fatalf("expected reindex timestamp to advance, got old=%v new=%v", originalIndexedAt, updated.LastIndexedAt)
	}
	if updated.ChunkCount == 0 {
		t.Fatalf("expected chunk count to be rebuilt, got %d", updated.ChunkCount)
	}
}

func TestKnowledgeDocumentServiceReplacesAttachmentDocumentInPlace(t *testing.T) {
	spaceService, documentService := newKnowledgeTestServices(t)

	space, err := spaceService.CreateSpace(5, CreateKnowledgeSpaceInput{Name: "Files"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	document, err := documentService.CreateDocument(context.Background(), 5, space.ID, CreateKnowledgeDocumentInput{
		Title:      "notes.txt",
		SourceType: SourceTypeAttachment,
		MIMEType:   "text/plain",
		Content:    "first body",
	})
	if err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}

	replaced, err := documentService.ReplaceAttachmentDocument(context.Background(), 5, space.ID, document.ID, ReplaceKnowledgeDocumentFileInput{
		Title:    "guide.md",
		MIMEType: "text/markdown",
		Content:  "# Guide\n\nsecond body",
	})
	if err != nil {
		t.Fatalf("ReplaceAttachmentDocument() error = %v", err)
	}
	if replaced.ID != document.ID {
		t.Fatalf("expected same document ID after replacement, got %d want %d", replaced.ID, document.ID)
	}
	if replaced.Title != "guide.md" || replaced.MIMEType != "text/markdown" {
		t.Fatalf("expected replacement metadata to update, got %#v", replaced)
	}
	if !strings.Contains(replaced.Content, "second body") {
		t.Fatalf("expected replacement content to persist, got %q", replaced.Content)
	}
}

func TestKnowledgeDocumentServiceDeletesDocument(t *testing.T) {
	spaceService, documentService := newKnowledgeTestServices(t)

	space, err := spaceService.CreateSpace(8, CreateKnowledgeSpaceInput{Name: "Docs"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	document, err := documentService.CreateDocument(context.Background(), 8, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Doc",
		SourceType: SourceTypeText,
		Content:    "delete me",
	})
	if err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}

	if err := documentService.DeleteDocument(8, space.ID, document.ID); err != nil {
		t.Fatalf("DeleteDocument() error = %v", err)
	}

	var documentCount int64
	if err := newKnowledgeTestDBQuery(t, spaceService).Model(&models.KnowledgeDocument{}).Where("id = ?", document.ID).Count(&documentCount).Error; err != nil {
		t.Fatalf("count documents: %v", err)
	}
	if documentCount != 0 {
		t.Fatalf("expected document to be deleted, got %d", documentCount)
	}
}

func newKnowledgeTestServices(t *testing.T) (*KnowledgeSpaceService, *KnowledgeDocumentService) {
	t.Helper()

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	return spaceService, NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
}

func newKnowledgeTestDBQuery(t *testing.T, spaceService *KnowledgeSpaceService) *gorm.DB {
	t.Helper()

	if spaceService == nil {
		t.Fatal("space service is required")
	}
	return spaceService.db
}

func newKnowledgeTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:knowledge-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Conversation{},
		&models.KnowledgeSpace{},
		&models.KnowledgeDocument{},
		&models.KnowledgeChunk{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	return db
}

func ptrTo(value string) *string {
	return &value
}
