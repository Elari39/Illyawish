package rag

import "context"

type noopEmbedder struct{}

func (n *noopEmbedder) EmbedTexts(_ context.Context, texts []string, _ ProviderConfig) ([][]float32, error) {
	result := make([][]float32, 0, len(texts))
	for range texts {
		result = append(result, []float32{0})
	}
	return result, nil
}

func (n *noopEmbedder) Rerank(_ context.Context, _ string, documents []string, _ ProviderConfig) ([]float32, error) {
	result := make([]float32, 0, len(documents))
	for range documents {
		result = append(result, 0)
	}
	return result, nil
}
