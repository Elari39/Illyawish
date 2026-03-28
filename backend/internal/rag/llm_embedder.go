package rag

import (
	"context"

	"backend/internal/llm"
)

type LLMEmbedder struct {
	client llm.RAGClient
}

func NewLLMEmbedder(client llm.RAGClient) *LLMEmbedder {
	return &LLMEmbedder{client: client}
}

func (e *LLMEmbedder) EmbedTexts(ctx context.Context, texts []string, provider ProviderConfig) ([][]float32, error) {
	return e.client.EmbedTexts(ctx, llm.VectorProviderConfig{
		BaseURL:        provider.BaseURL,
		APIKey:         provider.APIKey,
		EmbeddingModel: provider.EmbeddingModel,
		RerankerModel:  provider.RerankerModel,
	}, texts)
}

func (e *LLMEmbedder) Rerank(ctx context.Context, query string, documents []string, provider ProviderConfig) ([]float32, error) {
	return e.client.Rerank(ctx, llm.VectorProviderConfig{
		BaseURL:        provider.BaseURL,
		APIKey:         provider.APIKey,
		EmbeddingModel: provider.EmbeddingModel,
		RerankerModel:  provider.RerankerModel,
	}, query, documents)
}
