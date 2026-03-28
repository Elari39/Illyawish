package workflow

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

func TestListPresetsSerializesCamelCaseWorkflowPresetFields(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t)
	created, err := service.CreatePreset(7, CreatePresetInput{
		Name:              "Knowledge Q&A",
		TemplateKey:       TemplateKnowledgeQA,
		DefaultInputs:     map[string]any{"tone": "concise"},
		KnowledgeSpaceIDs: []uint{2, 5},
		ToolEnablements:   map[string]bool{"knowledge_search": true},
		OutputMode:        "markdown",
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/workflows/presets", nil)
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(service).ListPresets(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	var response struct {
		Presets []struct {
			ID               uint            `json:"id"`
			UserID           uint            `json:"userId"`
			Name             string          `json:"name"`
			TemplateKey      string          `json:"templateKey"`
			DefaultInputs    map[string]any  `json:"defaultInputs"`
			KnowledgeSpaceIDs []uint         `json:"knowledgeSpaceIds"`
			ToolEnablements  map[string]bool `json:"toolEnablements"`
			OutputMode       string          `json:"outputMode"`
			CreatedAt        string          `json:"createdAt"`
			UpdatedAt        string          `json:"updatedAt"`
		} `json:"presets"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(response.Presets) != 1 {
		t.Fatalf("expected 1 preset, got %d", len(response.Presets))
	}
	if response.Presets[0].ID != created.ID {
		t.Fatalf("expected preset id %d, got %d", created.ID, response.Presets[0].ID)
	}
	if response.Presets[0].UserID != 7 {
		t.Fatalf("expected user id 7, got %d", response.Presets[0].UserID)
	}
	if len(response.Presets[0].KnowledgeSpaceIDs) != 2 {
		t.Fatalf("expected camelCase knowledge space ids, got %#v", response.Presets[0].KnowledgeSpaceIDs)
	}
	if response.Presets[0].CreatedAt == "" || response.Presets[0].UpdatedAt == "" {
		t.Fatalf("expected timestamps in camelCase response, got %#v", response.Presets[0])
	}
}

func TestUpdatePresetReturnsUpdatedWorkflowPreset(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t)
	created, err := service.CreatePreset(7, CreatePresetInput{
		Name:        "Original",
		TemplateKey: TemplateKnowledgeQA,
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	body := bytes.NewBufferString(`{"name":"Updated","templateKey":"webpage_digest","defaultInputs":{"url":"https://example.com"},"knowledgeSpaceIds":[9],"toolEnablements":{"fetch_url":true},"outputMode":"markdown"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/workflows/presets/1", body)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "1"}}
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(service).UpdatePreset(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if !bytes.Contains(recorder.Body.Bytes(), []byte(`"name":"Updated"`)) {
		t.Fatalf("expected updated preset name in response, got %s", recorder.Body.String())
	}
	if !bytes.Contains(recorder.Body.Bytes(), []byte(`"templateKey":"webpage_digest"`)) {
		t.Fatalf("expected updated template key in response, got %s", recorder.Body.String())
	}
	if !bytes.Contains(recorder.Body.Bytes(), []byte(`"knowledgeSpaceIds":[9]`)) {
		t.Fatalf("expected updated knowledgeSpaceIds in response, got %s", recorder.Body.String())
	}

	if _, err := service.GetPreset(7, created.ID); err != nil {
		t.Fatalf("expected preset to remain accessible after update: %v", err)
	}
}

func TestDeletePresetReturnsNoContent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := newTestService(t)
	created, err := service.CreatePreset(7, CreatePresetInput{
		Name:        "Delete me",
		TemplateKey: TemplateKnowledgeQA,
	})
	if err != nil {
		t.Fatalf("CreatePreset() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/workflows/presets/1", nil)
	ctx.Params = gin.Params{{Key: "id", Value: "1"}}
	ctx.Set("current_user", &models.User{ID: 7})

	NewHandler(service).DeletePreset(ctx)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusNoContent, recorder.Code, recorder.Body.String())
	}
	if _, err := service.GetPreset(7, created.ID); err == nil {
		t.Fatal("expected preset to be deleted")
	}
}
