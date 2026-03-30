package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/rag"
	"backend/internal/workflow"
)

type chatModel interface {
	Stream(
		ctx context.Context,
		provider llm.ProviderConfig,
		messages []llm.ChatMessage,
		options llm.RequestOptions,
		onDelta func(llm.StreamDelta),
	) (llm.StreamResult, error)
}

type knowledgeSearcher interface {
	Search(ctx context.Context, userID uint, input rag.SearchInput, provider rag.ProviderConfig) (*rag.SearchResult, error)
}

type toolExecutor interface {
	FetchURL(ctx context.Context, url string) (string, error)
	ExecuteHTTPRequest(ctx context.Context, method string, url string, headers map[string]string, body string) (string, error)
	TransformText(ctx context.Context, content string) (string, error)
}

type Runtime struct {
	model         chatModel
	searcher      knowledgeSearcher
	tools         toolExecutor
	confirmations *ConfirmationManager
}

func NewRuntime(model chatModel, searcher knowledgeSearcher, tools toolExecutor, confirmations *ConfirmationManager) *Runtime {
	return &Runtime{
		model:         model,
		searcher:      searcher,
		tools:         tools,
		confirmations: confirmations,
	}
}

func (r *Runtime) Execute(ctx context.Context, input RunInput, emit func(Event) error) (*RunResult, error) {
	template, ok := workflow.BuiltInCatalog()[strings.TrimSpace(input.WorkflowTemplateKey)]
	if !ok {
		template = workflow.BuiltInCatalog()[workflow.TemplateKnowledgeQA]
	}

	summary := models.AgentRunSummary{
		WorkflowTemplateKey: template.Key,
		WorkflowPresetID:    input.WorkflowPresetID,
		KnowledgeSpaceIDs:   append([]uint(nil), input.KnowledgeSpaceIDs...),
		Citations:           []models.AgentCitation{},
		ToolCalls:           []models.AgentToolCallSummary{},
	}
	collectedContext := []string{strings.TrimSpace(input.UserMessage)}

	if emit != nil {
		if err := emit(Event{Type: EventTypeRunStarted, Metadata: map[string]any{"templateKey": template.Key}}); err != nil {
			return nil, err
		}
	}

	for index, node := range template.Nodes {
		if emit != nil {
			if err := emit(Event{
				Type:     EventTypeWorkflowStepStarted,
				StepName: node.Name,
				Metadata: map[string]any{"stepIndex": index},
			}); err != nil {
				return nil, err
			}
		}

		switch node.Type {
		case workflow.NodeTypeRetrieve:
			if emit != nil {
				if err := emit(Event{Type: EventTypeRetrievalStarted, StepName: node.Name}); err != nil {
					return nil, err
				}
			}
			result, err := r.searcher.Search(ctx, input.UserID, rag.SearchInput{
				Query:             input.UserMessage,
				KnowledgeSpaceIDs: input.KnowledgeSpaceIDs,
				MaxResults:        6,
			}, input.RAGProvider)
			if err != nil {
				return nil, err
			}
			summary.Citations = append(summary.Citations, result.Citations...)
			collectedContext = append(collectedContext, result.ContextBlocks...)
			if emit != nil {
				if err := emit(Event{
					Type:      EventTypeRetrievalCompleted,
					StepName:  node.Name,
					Citations: result.Citations,
					Metadata: map[string]any{
						"resultCount":         len(result.Citations),
						"knowledgeSpaceCount": len(input.KnowledgeSpaceIDs),
					},
				}); err != nil {
					return nil, err
				}
			}
		case workflow.NodeTypeTool:
			toolName := node.ToolName
			if input.ForcedTool != "" {
				toolName = input.ForcedTool
			}
			if err := r.runTool(ctx, toolName, input, &summary, &collectedContext, emit); err != nil {
				return nil, err
			}
		case workflow.NodeTypePrompt:
			fullPrompt := strings.Join(collectedContext, "\n\n")
			_, err := r.model.Stream(ctx, input.Provider, []llm.ChatMessage{
				{Role: models.RoleUser, Content: fullPrompt},
			}, llm.RequestOptions{}, func(delta llm.StreamDelta) {
				if emit != nil {
					if delta.Content != "" {
						_ = emit(Event{Type: EventTypeMessageDelta, StepName: node.Name, Content: delta.Content})
					}
				}
			})
			if err != nil {
				return nil, err
			}
		}

		if emit != nil {
			if err := emit(Event{
				Type:     EventTypeWorkflowStepCompleted,
				StepName: node.Name,
				Metadata: map[string]any{"stepIndex": index},
			}); err != nil {
				return nil, err
			}
		}
	}

	finalContent := ""
	finalReasoning := ""
	finalReasoningStarted := false
	emitFinalReasoningDelta := func(reasoning string) {
		if reasoning == "" || emit == nil {
			return
		}
		if !finalReasoningStarted {
			finalReasoningStarted = true
			_ = emit(Event{Type: EventTypeReasoningStart})
		}
		_ = emit(Event{Type: EventTypeReasoningDelta, Content: reasoning})
	}

	streamResult, err := r.model.Stream(ctx, input.Provider, []llm.ChatMessage{
		{Role: models.RoleUser, Content: strings.Join(collectedContext, "\n\n")},
	}, llm.RequestOptions{}, func(delta llm.StreamDelta) {
		finalContent += delta.Content
		finalReasoning += delta.Reasoning
		if emit != nil {
			if delta.Reasoning != "" {
				emitFinalReasoningDelta(delta.Reasoning)
			}
			if delta.Content != "" {
				_ = emit(Event{Type: EventTypeMessageDelta, Content: delta.Content})
			}
		}
	})
	if err != nil {
		return nil, err
	}
	if finalContent == "" {
		finalContent = streamResult.Content
	}
	if finalReasoning == "" {
		finalReasoning = streamResult.ReasoningContent
	}

	if emit != nil {
		if finalReasoningStarted {
			if err := emit(Event{Type: EventTypeReasoningDone, Content: finalReasoning}); err != nil {
				return nil, err
			}
		}
		if err := emit(Event{Type: EventTypeRunCompleted, Content: finalContent, Citations: summary.Citations}); err != nil {
			return nil, err
		}
	}
	return &RunResult{
		Content:          finalContent,
		ReasoningContent: finalReasoning,
		RunSummary:       summary,
	}, nil
}

func (r *Runtime) runTool(
	ctx context.Context,
	toolName string,
	input RunInput,
	summary *models.AgentRunSummary,
	collectedContext *[]string,
	emit func(Event) error,
) error {
	if emit != nil {
		if err := emit(Event{Type: EventTypeToolCallStarted, ToolName: toolName}); err != nil {
			return err
		}
	}

	var (
		output string
		err    error
	)
	switch toolName {
	case "knowledge_search":
		result, searchErr := r.searcher.Search(ctx, input.UserID, rag.SearchInput{
			Query:             input.UserMessage,
			KnowledgeSpaceIDs: input.KnowledgeSpaceIDs,
			MaxResults:        6,
		}, input.RAGProvider)
		if searchErr != nil {
			return searchErr
		}
		summary.Citations = append(summary.Citations, result.Citations...)
		output = strings.Join(result.ContextBlocks, "\n\n")
	case "fetch_url":
		url := stringInput(input.WorkflowInputs, "url", input.UserMessage)
		output, err = r.tools.FetchURL(ctx, url)
	case "http_request":
		confirmationID, approvalCh := r.confirmations.Register()
		if emit != nil {
			if err := emit(Event{
				Type:           EventTypeToolCallConfirmationRequired,
				ToolName:       toolName,
				ConfirmationID: confirmationID,
				Metadata: map[string]any{
					"confirmationLabel": "Confirm HTTP request",
				},
			}); err != nil {
				return err
			}
		}
		select {
		case approved := <-approvalCh:
			if !approved {
				return errors.New("tool confirmation rejected")
			}
		case <-ctx.Done():
			return ctx.Err()
		}
		url := stringInput(input.WorkflowInputs, "url", input.UserMessage)
		output, err = r.tools.ExecuteHTTPRequest(ctx, "GET", url, nil, "")
	case "text_transform":
		output, err = r.tools.TransformText(ctx, input.UserMessage)
	default:
		return fmt.Errorf("unsupported tool %q", toolName)
	}
	if err != nil {
		return err
	}

	*collectedContext = append(*collectedContext, output)
	summary.ToolCalls = append(summary.ToolCalls, models.AgentToolCallSummary{
		ToolName:      toolName,
		Status:        "completed",
		InputSummary:  stringInput(input.WorkflowInputs, "url", input.UserMessage),
		OutputSummary: output,
	})
	if emit != nil {
		if err := emit(Event{
			Type:     EventTypeToolCallCompleted,
			ToolName: toolName,
			Content:  output,
			Metadata: map[string]any{
				"outputPreview": previewText(output, 120),
			},
		}); err != nil {
			return err
		}
	}
	return nil
}

func stringInput(values map[string]any, key string, fallback string) string {
	if values != nil {
		if value, ok := values[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return strings.TrimSpace(fallback)
}

func previewText(value string, maxRunes int) string {
	text := strings.TrimSpace(value)
	if maxRunes <= 0 || len([]rune(text)) <= maxRunes {
		return text
	}

	runes := []rune(text)
	return strings.TrimSpace(string(runes[:maxRunes])) + "..."
}
