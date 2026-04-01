package chat

import (
	"strings"
)

const thinkTagOpen = "<think>"
const thinkTagClose = "</think>"

type splitReasoningContentResult struct {
	reasoning string
	content   string
}

type assistantResponseBuffer struct {
	rawContent       string
	parsedReasoning  string
	parsedContent    string
	content          string
	reasoningContent string
	reasoningStarted bool
	reasoningDone    bool
}

func (b *assistantResponseBuffer) applyDelta(deltaContent string, deltaReasoning string, emit func(StreamEvent) bool) {
	if deltaReasoning != "" {
		b.appendReasoning(deltaReasoning, emit)
	}
	if deltaContent == "" {
		return
	}

	b.rawContent += deltaContent
	split := splitLeadingReasoningContent(b.rawContent)

	if newReasoning := diffFromPrefix(split.reasoning, b.parsedReasoning); newReasoning != "" {
		b.parsedReasoning = split.reasoning
		b.appendReasoning(newReasoning, emit)
	}

	if newContent := diffFromPrefix(split.content, b.parsedContent); newContent != "" {
		b.parsedContent = split.content
		b.appendContent(newContent, emit)
	} else {
		b.parsedContent = split.content
	}
}

func (b *assistantResponseBuffer) finishReasoning(emit func(StreamEvent) bool) {
	if !b.reasoningStarted || b.reasoningDone {
		return
	}
	b.reasoningDone = true
	emit(StreamEvent{Type: "reasoning_done"})
}

func (b *assistantResponseBuffer) appendReasoning(chunk string, emit func(StreamEvent) bool) {
	if chunk == "" {
		return
	}
	if !b.reasoningStarted {
		b.reasoningStarted = true
		emit(StreamEvent{Type: "reasoning_start"})
	}
	b.reasoningContent += chunk
	emit(StreamEvent{
		Type:    "reasoning_delta",
		Content: chunk,
	})
}

func (b *assistantResponseBuffer) appendContent(chunk string, emit func(StreamEvent) bool) {
	if chunk == "" {
		return
	}
	b.content += chunk
	emit(StreamEvent{
		Type:    "delta",
		Content: chunk,
	})
}

func splitLeadingReasoningContent(raw string) splitReasoningContentResult {
	if raw == "" {
		return splitReasoningContentResult{}
	}

	index := 0
	var reasoning strings.Builder
	consumedLeadingThink := false

	for {
		whitespaceStart := index
		for index < len(raw) && isThinkWhitespace(raw[index]) {
			index++
		}

		if index >= len(raw) {
			if consumedLeadingThink {
				return splitReasoningContentResult{
					reasoning: reasoning.String(),
				}
			}
			return splitReasoningContentResult{
				content: raw,
			}
		}

		remaining := raw[index:]
		switch {
		case strings.HasPrefix(remaining, thinkTagOpen):
			consumedLeadingThink = true
			index += len(thinkTagOpen)

			closeIndex := strings.Index(raw[index:], thinkTagClose)
			if closeIndex == -1 {
				reasoning.WriteString(trimPotentialTagSuffix(raw[index:], thinkTagClose))
				return splitReasoningContentResult{
					reasoning: reasoning.String(),
				}
			}

			reasoning.WriteString(raw[index : index+closeIndex])
			index += closeIndex + len(thinkTagClose)
		case isPotentialThinkPrefix(remaining):
			return splitReasoningContentResult{
				reasoning: reasoning.String(),
			}
		case consumedLeadingThink:
			return splitReasoningContentResult{
				reasoning: reasoning.String(),
				content:   raw[whitespaceStart:],
			}
		default:
			return splitReasoningContentResult{
				content: raw,
			}
		}
	}
}

func isPotentialThinkPrefix(value string) bool {
	return len(value) < len(thinkTagOpen) && strings.HasPrefix(thinkTagOpen, value)
}

func isThinkWhitespace(char byte) bool {
	switch char {
	case ' ', '\n', '\r', '\t':
		return true
	default:
		return false
	}
}

func diffFromPrefix(current string, previous string) string {
	if previous == "" {
		return current
	}
	if !strings.HasPrefix(current, previous) {
		return ""
	}
	return current[len(previous):]
}

func trimPotentialTagSuffix(value string, tag string) string {
	maxPrefix := len(tag) - 1
	if len(value) < maxPrefix {
		maxPrefix = len(value)
	}

	for size := maxPrefix; size > 0; size-- {
		if strings.HasSuffix(value, tag[:size]) {
			return value[:len(value)-size]
		}
	}
	return value
}
