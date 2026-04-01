package rag

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

type fakeURLFetcher struct{}

func (f *fakeURLFetcher) FetchURL(_ context.Context, rawURL string) (string, error) {
	switch rawURL {
	case "https://8.8.8.8/new":
		return "fetched body", nil
	case "https://8.8.4.4/updated":
		return "fresh body", nil
	default:
		return "fetched body", nil
	}
}

func TestListKnowledgeSpacesReturnsCamelCaseDTO(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(7, CreateKnowledgeSpaceInput{
		Name:        "Engineering",
		Description: "Specs and notes",
	})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/knowledge/spaces", nil)
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(nil, spaceService, documentService, nil).ListKnowledgeSpaces(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, `"name":"Engineering"`) {
		t.Fatalf("expected camelCase name field, got %s", body)
	}
	if !strings.Contains(body, `"description":"Specs and notes"`) {
		t.Fatalf("expected description field, got %s", body)
	}
	if strings.Contains(body, `"Name":"Engineering"`) || strings.Contains(body, `"Description":"Specs and notes"`) {
		t.Fatalf("expected DTO response instead of raw model JSON, got %s", body)
	}
	if !strings.Contains(body, fmt.Sprintf(`"id":%d`, space.ID)) {
		t.Fatalf("expected id field, got %s", body)
	}
}

func TestUploadKnowledgeDocumentsCreatesAttachmentDocuments(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(3, CreateKnowledgeSpaceInput{Name: "Uploads"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	first, err := writer.CreateFormFile("files", "notes.txt")
	if err != nil {
		t.Fatalf("CreateFormFile(notes.txt) error = %v", err)
	}
	if _, err := first.Write([]byte("hello knowledge")); err != nil {
		t.Fatalf("write notes.txt: %v", err)
	}

	second, err := writer.CreateFormFile("files", "guide.md")
	if err != nil {
		t.Fatalf("CreateFormFile(guide.md) error = %v", err)
	}
	if _, err := second.Write([]byte("# Guide\n\nmarkdown content")); err != nil {
		t.Fatalf("write guide.md: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/knowledge/spaces/%d/documents/upload", space.ID),
		&body,
	)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	ctx.Request = request
	ctx.Params = gin.Params{{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)}}
	ctx.Set("current_user", &models.User{ID: 3})

	NewHandler(nil, spaceService, documentService, nil).UploadKnowledgeDocuments(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}
	responseBody := recorder.Body.String()
	if !strings.Contains(responseBody, `"title":"notes.txt"`) || !strings.Contains(responseBody, `"title":"guide.md"`) {
		t.Fatalf("expected uploaded documents in response, got %s", responseBody)
	}
	if !strings.Contains(responseBody, `"sourceType":"attachment"`) {
		t.Fatalf("expected attachment source type, got %s", responseBody)
	}

	var count int64
	if err := db.Model(&models.KnowledgeDocument{}).Where("user_id = ? AND knowledge_space_id = ?", 3, space.ID).Count(&count).Error; err != nil {
		t.Fatalf("count uploaded knowledge documents: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 uploaded knowledge documents, got %d", count)
	}
}

func TestUploadKnowledgeDocumentsDoesNotPersistPartialBatch(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(3, CreateKnowledgeSpaceInput{Name: "Uploads"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	first, err := writer.CreateFormFile("files", "notes.txt")
	if err != nil {
		t.Fatalf("CreateFormFile(notes.txt) error = %v", err)
	}
	if _, err := first.Write([]byte("hello knowledge")); err != nil {
		t.Fatalf("write notes.txt: %v", err)
	}

	second, err := writer.CreateFormFile("files", "image.png")
	if err != nil {
		t.Fatalf("CreateFormFile(image.png) error = %v", err)
	}
	if _, err := second.Write([]byte{0x89, 0x50, 0x4e, 0x47}); err != nil {
		t.Fatalf("write image.png: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/knowledge/spaces/%d/documents/upload", space.ID),
		&body,
	)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	ctx.Request = request
	ctx.Params = gin.Params{{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)}}
	ctx.Set("current_user", &models.User{ID: 3})

	NewHandler(nil, spaceService, documentService, nil).UploadKnowledgeDocuments(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusBadRequest, recorder.Code, recorder.Body.String())
	}

	var count int64
	if err := db.Model(&models.KnowledgeDocument{}).Where("user_id = ? AND knowledge_space_id = ?", 3, space.ID).Count(&count).Error; err != nil {
		t.Fatalf("count uploaded knowledge documents: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected failed batch to leave 0 uploaded knowledge documents, got %d", count)
	}
}

func TestUpdateKnowledgeSpaceReturnsUpdatedDTO(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(7, CreateKnowledgeSpaceInput{
		Name:        "Engineering",
		Description: "Specs",
	})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	body := strings.NewReader(`{"name":"Updated","description":"Notes"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/knowledge/spaces/%d", space.ID), body)
	request.Header.Set("Content-Type", "application/json")
	ctx.Request = request
	ctx.Params = gin.Params{{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)}}
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(nil, spaceService, documentService, nil).UpdateKnowledgeSpace(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"name":"Updated"`) {
		t.Fatalf("expected updated DTO, got %s", recorder.Body.String())
	}
}

func TestUpdateKnowledgeDocumentFetchesURLContentWhenBlank(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(7, CreateKnowledgeSpaceInput{Name: "Engineering"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	document, err := documentService.CreateDocument(context.Background(), 7, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Article",
		SourceType: SourceTypeURL,
		SourceURI:  "https://9.9.9.9/old",
		Content:    "old body",
	})
	if err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}

	body := strings.NewReader(`{"title":"Fetched","sourceUri":"https://8.8.8.8/new","content":""}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(
		http.MethodPatch,
		fmt.Sprintf("/api/knowledge/spaces/%d/documents/%d", space.ID, document.ID),
		body,
	)
	request.Header.Set("Content-Type", "application/json")
	ctx.Request = request
	ctx.Params = gin.Params{
		{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)},
		{Key: "documentId", Value: fmt.Sprintf("%d", document.ID)},
	}
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(nil, spaceService, documentService, &fakeURLFetcher{}).UpdateKnowledgeDocument(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	responseBody := recorder.Body.String()
	if !strings.Contains(responseBody, `"title":"Fetched"`) || !strings.Contains(responseBody, `"content":"fetched body"`) {
		t.Fatalf("expected fetched URL content in response, got %s", responseBody)
	}
}

func TestUpdateKnowledgeDocumentRefetchesWhenSourceURIChangesWithStaleContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(7, CreateKnowledgeSpaceInput{Name: "Engineering"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	document, err := documentService.CreateDocument(context.Background(), 7, space.ID, CreateKnowledgeDocumentInput{
		Title:      "Article",
		SourceType: SourceTypeURL,
		SourceURI:  "https://9.9.9.9/old",
		Content:    "old body",
	})
	if err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}

	body := strings.NewReader(`{"sourceUri":"https://8.8.4.4/updated","content":"old body"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(
		http.MethodPatch,
		fmt.Sprintf("/api/knowledge/spaces/%d/documents/%d", space.ID, document.ID),
		body,
	)
	request.Header.Set("Content-Type", "application/json")
	ctx.Request = request
	ctx.Params = gin.Params{
		{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)},
		{Key: "documentId", Value: fmt.Sprintf("%d", document.ID)},
	}
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(nil, spaceService, documentService, &fakeURLFetcher{}).UpdateKnowledgeDocument(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	responseBody := recorder.Body.String()
	if !strings.Contains(responseBody, `"sourceUri":"https://8.8.4.4/updated"`) || !strings.Contains(responseBody, `"content":"fresh body"`) {
		t.Fatalf("expected changed source URI to refetch fresh content, got %s", responseBody)
	}
}

func TestCreateKnowledgeDocumentRejectsUnsafeURL(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(7, CreateKnowledgeSpaceInput{Name: "Engineering"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	body := strings.NewReader(`{"title":"Local","sourceType":"url","sourceUri":"http://127.0.0.1/private","content":""}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/knowledge/spaces/%d/documents", space.ID),
		body,
	)
	request.Header.Set("Content-Type", "application/json")
	ctx.Request = request
	ctx.Params = gin.Params{{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)}}
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(nil, spaceService, documentService, &fakeURLFetcher{}).CreateKnowledgeDocument(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusBadRequest, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "unsafe URL") {
		t.Fatalf("expected unsafe URL validation error, got %s", recorder.Body.String())
	}
}

func TestCreateKnowledgeDocumentAllowsSafePublicURL(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(7, CreateKnowledgeSpaceInput{Name: "Engineering"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}

	body := strings.NewReader(`{"title":"Public","sourceType":"url","sourceUri":"https://8.8.8.8/new","content":""}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/knowledge/spaces/%d/documents", space.ID),
		body,
	)
	request.Header.Set("Content-Type", "application/json")
	ctx.Request = request
	ctx.Params = gin.Params{{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)}}
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(nil, spaceService, documentService, &fakeURLFetcher{}).CreateKnowledgeDocument(ctx)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"content":"fetched body"`) {
		t.Fatalf("expected safe public URL to proceed with fetched content, got %s", recorder.Body.String())
	}
}

func TestReplaceKnowledgeDocumentUpdatesAttachmentInPlace(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newKnowledgeTestDB(t)
	spaceService := NewKnowledgeSpaceService(db)
	documentService := NewKnowledgeDocumentService(db, spaceService, nil, &fakeEmbedder{})
	space, err := spaceService.CreateSpace(3, CreateKnowledgeSpaceInput{Name: "Uploads"})
	if err != nil {
		t.Fatalf("CreateSpace() error = %v", err)
	}
	document, err := documentService.CreateDocument(context.Background(), 3, space.ID, CreateKnowledgeDocumentInput{
		Title:      "notes.txt",
		SourceType: SourceTypeAttachment,
		MIMEType:   "text/plain",
		Content:    "hello knowledge",
	})
	if err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fileWriter, err := writer.CreateFormFile("file", "guide.md")
	if err != nil {
		t.Fatalf("CreateFormFile(guide.md) error = %v", err)
	}
	if _, err := fileWriter.Write([]byte("# Guide\n\nupdated")); err != nil {
		t.Fatalf("write guide.md: %v", err)
	}
	if err := writer.WriteField("title", "guide.md"); err != nil {
		t.Fatalf("WriteField(title) error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/knowledge/spaces/%d/documents/%d/replace", space.ID, document.ID),
		&body,
	)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	ctx.Request = request
	ctx.Params = gin.Params{
		{Key: "spaceId", Value: fmt.Sprintf("%d", space.ID)},
		{Key: "documentId", Value: fmt.Sprintf("%d", document.ID)},
	}
	ctx.Set("current_user", &models.User{ID: 3})

	NewHandler(nil, spaceService, documentService, nil).ReplaceKnowledgeDocumentFile(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	responseBody := recorder.Body.String()
	if !strings.Contains(responseBody, fmt.Sprintf(`"id":%d`, document.ID)) {
		t.Fatalf("expected document ID to stay the same, got %s", responseBody)
	}
	if !strings.Contains(responseBody, `"title":"guide.md"`) {
		t.Fatalf("expected updated title, got %s", responseBody)
	}
}
