package rag

import "strings"

const (
	defaultChunkSize    = 320
	defaultChunkOverlap = 48
)

func chunkText(content string) []string {
	words := strings.Fields(strings.TrimSpace(content))
	if len(words) == 0 {
		return nil
	}
	if len(words) <= defaultChunkSize {
		return []string{strings.Join(words, " ")}
	}

	chunks := make([]string, 0, len(words)/defaultChunkSize+1)
	start := 0
	for start < len(words) {
		end := start + defaultChunkSize
		if end > len(words) {
			end = len(words)
		}
		chunks = append(chunks, strings.Join(words[start:end], " "))
		if end == len(words) {
			break
		}
		start = end - defaultChunkOverlap
		if start < 0 {
			start = 0
		}
	}
	return chunks
}
