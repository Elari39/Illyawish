package agent

import (
	"context"
	"sync"
	"testing"
	"time"

	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/rag"
	"backend/internal/workflow"
)

type fakeChatModel struct {
	content   string
	responses []fakeStreamResponse
	callCount int
}

type fakeStreamResponse struct {
	deltas []llm.StreamDelta
	result llm.StreamResult
	err    error
}

func (f *fakeChatModel) Stream(
	_ context.Context,
	_ llm.ProviderConfig,
	_ []llm.ChatMessage,
	_ llm.RequestOptions,
	onDelta func(llm.StreamDelta),
) (llm.StreamResult, error) {
	response := fakeStreamResponse{
		deltas: []llm.StreamDelta{{Content: f.content}},
		result: llm.StreamResult{Content: f.content, FinishReason: "stop"},
	}
	if f.callCount < len(f.responses) {
		response = f.responses[f.callCount]
	}
	f.callCount++

	if onDelta != nil {
		for _, delta := range response.deltas {
			onDelta(delta)
		}
	}
	if response.result.Content == "" && response.result.ReasoningContent == "" {
		for _, delta := range response.deltas {
			response.result.Content += delta.Content
			response.result.ReasoningContent += delta.Reasoning
		}
	}
	if response.result.FinishReason == "" {
		response.result.FinishReason = "stop"
	}
	return response.result, response.err
}

type fakeKnowledgeSearcher struct {
	result *rag.SearchResult
}

func (f *fakeKnowledgeSearcher) Search(_ context.Context, _ uint, _ rag.SearchInput, _ rag.ProviderConfig) (*rag.SearchResult, error) {
	return f.result, nil
}

type fakeToolExecutor struct{}

func (f *fakeToolExecutor) FetchURL(_ context.Context, url string) (string, error) {
	return "fetched: " + url, nil
}

func (f *fakeToolExecutor) ExecuteHTTPRequest(_ context.Context, method string, url string, _ map[string]string, _ string) (string, error) {
	return method + " " + url, nil
}

func (f *fakeToolExecutor) TransformText(_ context.Context, content string) (string, error) {
	return "transformed: " + content, nil
}

func TestRuntimeExecutesKnowledgeWorkflowAndCollectsCitations(t *testing.T) {
	manager := NewConfirmationManager()
	runtime := NewRuntime(&fakeChatModel{content: "answer with citations"}, &fakeKnowledgeSearcher{
		result: &rag.SearchResult{
			Citations: []models.AgentCitation{
				{DocumentID: 1, DocumentName: "Spec", ChunkID: 7, Snippet: "Embedding details"},
			},
			ContextBlocks: []string{"Embedding details"},
		},
	}, &fakeToolExecutor{}, manager)

	var events []Event
	result, err := runtime.Execute(context.Background(), RunInput{
		UserID:              1,
		ConversationID:      12,
		UserMessage:         "Explain embeddings",
		WorkflowTemplateKey: workflow.TemplateKnowledgeQA,
		KnowledgeSpaceIDs:   []uint{3},
		Provider: llm.ProviderConfig{
			BaseURL:      "https://example.com/v1",
			APIKey:       "key",
			DefaultModel: "gpt-4.1-mini",
		},
	}, func(event Event) error {
		events = append(events, event)
		return nil
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if result.Content != "answer with citations" {
		t.Fatalf("expected final content, got %q", result.Content)
	}
	if len(result.RunSummary.Citations) != 1 {
		t.Fatalf("expected one citation, got %#v", result.RunSummary.Citations)
	}
	if !containsEvent(events, EventTypeRetrievalStarted) || !containsEvent(events, EventTypeRetrievalCompleted) {
		t.Fatalf("expected retrieval events, got %#v", events)
	}
	if !containsEvent(events, EventTypeRunCompleted) {
		t.Fatalf("expected run completion event, got %#v", events)
	}
}

func TestRuntimeEmitsExecutionPanelMetadata(t *testing.T) {
	manager := NewConfirmationManager()
	runtime := NewRuntime(&fakeChatModel{content: "answer with citations"}, &fakeKnowledgeSearcher{
		result: &rag.SearchResult{
			Citations: []models.AgentCitation{
				{DocumentID: 1, DocumentName: "Spec", ChunkID: 7, Snippet: "Embedding details"},
			},
			ContextBlocks: []string{"Embedding details"},
		},
	}, &fakeToolExecutor{}, manager)

	var events []Event
	_, err := runtime.Execute(context.Background(), RunInput{
		UserID:              1,
		ConversationID:      12,
		UserMessage:         "Explain embeddings",
		WorkflowTemplateKey: workflow.TemplateKnowledgeQA,
		KnowledgeSpaceIDs:   []uint{3},
		Provider: llm.ProviderConfig{
			BaseURL:      "https://example.com/v1",
			APIKey:       "key",
			DefaultModel: "gpt-4.1-mini",
		},
	}, func(event Event) error {
		events = append(events, event)
		return nil
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	runStarted := findEventByType(events, EventTypeRunStarted)
	if runStarted == nil {
		t.Fatal("expected run_started event")
	}
	if runStarted.Metadata["templateKey"] != workflow.TemplateKnowledgeQA {
		t.Fatalf("expected templateKey metadata, got %#v", runStarted.Metadata)
	}

	questionStarted := findEventByTypeAndStep(events, EventTypeWorkflowStepStarted, "question")
	if questionStarted == nil {
		t.Fatal("expected workflow_step_started event for question")
	}
	if questionStarted.Metadata["stepIndex"] != 0 {
		t.Fatalf("expected question stepIndex metadata, got %#v", questionStarted.Metadata)
	}

	retrievalCompleted := findEventByType(events, EventTypeRetrievalCompleted)
	if retrievalCompleted == nil {
		t.Fatal("expected retrieval_completed event")
	}
	if retrievalCompleted.Metadata["resultCount"] != 1 {
		t.Fatalf("expected retrieval resultCount metadata, got %#v", retrievalCompleted.Metadata)
	}
	if retrievalCompleted.Metadata["knowledgeSpaceCount"] != 1 {
		t.Fatalf("expected retrieval knowledgeSpaceCount metadata, got %#v", retrievalCompleted.Metadata)
	}
}

func TestRuntimeEmitsFinalReasoningLifecycleOnce(t *testing.T) {
	manager := NewConfirmationManager()
	runtime := NewRuntime(&fakeChatModel{
		responses: []fakeStreamResponse{
			{
				deltas: []llm.StreamDelta{
					{Content: "draft step output"},
				},
			},
			{
				deltas: []llm.StreamDelta{
					{Reasoning: "step 1"},
					{Reasoning: " -> step 2"},
					{Content: "final answer"},
				},
				result: llm.StreamResult{
					Content:          "final answer",
					ReasoningContent: "step 1 -> step 2",
					FinishReason:     "stop",
				},
			},
		},
	}, &fakeKnowledgeSearcher{
		result: &rag.SearchResult{
			Citations: []models.AgentCitation{
				{DocumentID: 1, DocumentName: "Spec", ChunkID: 7, Snippet: "Embedding details"},
			},
			ContextBlocks: []string{"Embedding details"},
		},
	}, &fakeToolExecutor{}, manager)

	var events []Event
	result, err := runtime.Execute(context.Background(), RunInput{
		UserID:              1,
		ConversationID:      12,
		UserMessage:         "Explain embeddings",
		WorkflowTemplateKey: workflow.TemplateKnowledgeQA,
		KnowledgeSpaceIDs:   []uint{3},
		Provider: llm.ProviderConfig{
			BaseURL:      "https://example.com/v1",
			APIKey:       "key",
			DefaultModel: "gpt-4.1-mini",
		},
	}, func(event Event) error {
		events = append(events, event)
		return nil
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if result.ReasoningContent != "step 1 -> step 2" {
		t.Fatalf("expected final reasoning content, got %q", result.ReasoningContent)
	}
	if countEvents(events, EventTypeReasoningStart) != 1 {
		t.Fatalf("expected exactly one reasoning_start event, got %#v", events)
	}
	if countEvents(events, EventTypeReasoningDelta) != 2 {
		t.Fatalf("expected two reasoning_delta events, got %#v", events)
	}

	reasoningDone := findEventByType(events, EventTypeReasoningDone)
	if reasoningDone == nil {
		t.Fatalf("expected reasoning_done event, got %#v", events)
	}
	if reasoningDone.Content != "step 1 -> step 2" {
		t.Fatalf("expected aggregated reasoning_done content, got %#v", reasoningDone)
	}
}

func TestRuntimeRequiresConfirmationForHTTPRequestTool(t *testing.T) {
	manager := NewConfirmationManager()
	runtime := NewRuntime(&fakeChatModel{content: "done"}, &fakeKnowledgeSearcher{}, &fakeToolExecutor{}, manager)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var (
		events []Event
		runErr error
	)
	var eventsMu sync.Mutex
	confirmationCh := make(chan string, 1)
	done := make(chan struct{})
	go func() {
		_, runErr = runtime.Execute(ctx, RunInput{
			UserID:              1,
			ConversationID:      12,
			UserMessage:         "Call API",
			WorkflowTemplateKey: workflow.TemplateWebpageDigest,
			WorkflowInputs: map[string]any{
				"url": "https://example.com",
			},
			ForcedTool: "http_request",
			Provider: llm.ProviderConfig{
				BaseURL:      "https://example.com/v1",
				APIKey:       "key",
				DefaultModel: "gpt-4.1-mini",
			},
		}, func(event Event) error {
			eventsMu.Lock()
			events = append(events, event)
			eventsMu.Unlock()
			if event.Type == EventTypeToolCallConfirmationRequired && event.ConfirmationID != "" {
				select {
				case confirmationCh <- event.ConfirmationID:
				default:
				}
			}
			return nil
		})
		close(done)
	}()

	var confirmationID string
	select {
	case confirmationID = <-confirmationCh:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected confirmation id")
	}
	if err := manager.Resolve(confirmationID, true); err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("runtime did not finish after approval")
	}

	if runErr != nil {
		t.Fatalf("expected run to succeed, got %v", runErr)
	}
	eventsMu.Lock()
	defer eventsMu.Unlock()
	if !containsEvent(events, EventTypeToolCallConfirmationRequired) {
		t.Fatalf("expected confirmation event, got %#v", events)
	}
	if !containsEvent(events, EventTypeToolCallCompleted) {
		t.Fatalf("expected tool completion event, got %#v", events)
	}

	confirmationEvent := findEventByType(events, EventTypeToolCallConfirmationRequired)
	if confirmationEvent == nil {
		t.Fatal("expected confirmation event")
	}
	if confirmationEvent.Metadata["confirmationLabel"] == "" {
		t.Fatalf("expected confirmation label metadata, got %#v", confirmationEvent.Metadata)
	}

	completedEvent := findEventByType(events, EventTypeToolCallCompleted)
	if completedEvent == nil {
		t.Fatal("expected tool completion event")
	}
	if completedEvent.Metadata["outputPreview"] == "" {
		t.Fatalf("expected output preview metadata, got %#v", completedEvent.Metadata)
	}
}

func containsEvent(events []Event, eventType string) bool {
	for _, event := range events {
		if event.Type == eventType {
			return true
		}
	}
	return false
}

func countEvents(events []Event, eventType string) int {
	count := 0
	for _, event := range events {
		if event.Type == eventType {
			count++
		}
	}
	return count
}

func findEventByType(events []Event, eventType string) *Event {
	for index := range events {
		if events[index].Type == eventType {
			return &events[index]
		}
	}
	return nil
}

func findEventByTypeAndStep(events []Event, eventType string, stepName string) *Event {
	for index := range events {
		if events[index].Type == eventType && events[index].StepName == stepName {
			return &events[index]
		}
	}
	return nil
}
