package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	aclopenai "github.com/cloudwego/eino-ext/libs/acl/openai"
)

type VectorProviderConfig struct {
	BaseURL        string
	APIKey         string
	EmbeddingModel string
	RerankerModel  string
}

type RAGClient interface {
	EmbedTexts(ctx context.Context, provider VectorProviderConfig, texts []string) ([][]float32, error)
	Rerank(ctx context.Context, provider VectorProviderConfig, query string, documents []string) ([]float32, error)
}

type EinoRAGClient struct {
	httpClient         *http.Client
	newEmbeddingClient func(context.Context, *aclopenai.EmbeddingConfig) (*aclopenai.EmbeddingClient, error)
}

func NewRAGClient() *EinoRAGClient {
	return &EinoRAGClient{
		httpClient: http.DefaultClient,
		newEmbeddingClient: func(ctx context.Context, cfg *aclopenai.EmbeddingConfig) (*aclopenai.EmbeddingClient, error) {
			return aclopenai.NewEmbeddingClient(ctx, cfg)
		},
	}
}

func (c *EinoRAGClient) EmbedTexts(ctx context.Context, provider VectorProviderConfig, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return [][]float32{}, nil
	}
	if err := validateEmbeddingProvider(provider); err != nil {
		return nil, err
	}

	client, err := c.newEmbeddingClient(ctx, &aclopenai.EmbeddingConfig{
		APIKey:     provider.APIKey,
		BaseURL:    strings.TrimRight(provider.BaseURL, "/"),
		Model:      provider.EmbeddingModel,
		HTTPClient: c.httpClient,
	})
	if err != nil {
		return nil, fmt.Errorf("create embedding client: %w", err)
	}

	embeddings, err := client.EmbedStrings(ctx, texts)
	if err != nil {
		return nil, fmt.Errorf("embed texts: %w", err)
	}

	result := make([][]float32, 0, len(embeddings))
	for _, row := range embeddings {
		vector := make([]float32, 0, len(row))
		for _, value := range row {
			vector = append(vector, float32(value))
		}
		result = append(result, vector)
	}
	return result, nil
}

func (c *EinoRAGClient) Rerank(ctx context.Context, provider VectorProviderConfig, query string, documents []string) ([]float32, error) {
	if len(documents) == 0 {
		return []float32{}, nil
	}
	if err := validateRerankerProvider(provider); err != nil {
		return nil, err
	}

	payload, err := json.Marshal(rerankRequest{
		Model:           provider.RerankerModel,
		Query:           strings.TrimSpace(query),
		Documents:       documents,
		TopN:            len(documents),
		ReturnDocuments: false,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal rerank request: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(provider.BaseURL, "/")+"/rerank",
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, fmt.Errorf("build rerank request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send rerank request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var apiErr struct {
			Error any `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&apiErr)
		return nil, fmt.Errorf("rerank request failed: %s", resp.Status)
	}

	var body rerankResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode rerank response: %w", err)
	}

	scores := make([]float32, len(documents))
	filled := false
	for _, item := range body.Results {
		if item.Index < 0 || item.Index >= len(scores) {
			continue
		}
		scores[item.Index] = item.RelevanceScore
		filled = true
	}
	for _, item := range body.Data {
		if item.Index < 0 || item.Index >= len(scores) {
			continue
		}
		if item.RelevanceScore != 0 {
			scores[item.Index] = item.RelevanceScore
		} else {
			scores[item.Index] = item.Score
		}
		filled = true
	}
	if !filled {
		return nil, fmt.Errorf("rerank response did not contain scores")
	}
	return scores, nil
}

type rerankRequest struct {
	Model           string   `json:"model"`
	Query           string   `json:"query"`
	Documents       []string `json:"documents"`
	TopN            int      `json:"top_n,omitempty"`
	ReturnDocuments bool     `json:"return_documents"`
}

type rerankResponse struct {
	Results []struct {
		Index          int     `json:"index"`
		RelevanceScore float32 `json:"relevance_score"`
	} `json:"results"`
	Data []struct {
		Index          int     `json:"index"`
		Score          float32 `json:"score"`
		RelevanceScore float32 `json:"relevance_score"`
	} `json:"data"`
}

func validateEmbeddingProvider(provider VectorProviderConfig) error {
	if strings.TrimSpace(provider.BaseURL) == "" {
		return fmt.Errorf("embedding base URL is required")
	}
	if strings.TrimSpace(provider.APIKey) == "" {
		return fmt.Errorf("embedding API key is required")
	}
	if strings.TrimSpace(provider.EmbeddingModel) == "" {
		return fmt.Errorf("embedding model is required")
	}
	return nil
}

func validateRerankerProvider(provider VectorProviderConfig) error {
	if strings.TrimSpace(provider.BaseURL) == "" {
		return fmt.Errorf("reranker base URL is required")
	}
	if strings.TrimSpace(provider.APIKey) == "" {
		return fmt.Errorf("reranker API key is required")
	}
	if strings.TrimSpace(provider.RerankerModel) == "" {
		return fmt.Errorf("reranker model is required")
	}
	return nil
}
