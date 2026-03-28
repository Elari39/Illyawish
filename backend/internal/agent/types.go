package agent

import (
	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/rag"
)

const (
	EventTypeRunStarted                   = "run_started"
	EventTypeWorkflowStepStarted          = "workflow_step_started"
	EventTypeWorkflowStepCompleted        = "workflow_step_completed"
	EventTypeRetrievalStarted             = "retrieval_started"
	EventTypeRetrievalCompleted           = "retrieval_completed"
	EventTypeToolCallStarted              = "tool_call_started"
	EventTypeToolCallConfirmationRequired = "tool_call_confirmation_required"
	EventTypeToolCallCompleted            = "tool_call_completed"
	EventTypeMessageDelta                 = "message_delta"
	EventTypeRunCompleted                 = "run_completed"
)

type Event struct {
	Type           string                 `json:"type"`
	StepName       string                 `json:"stepName,omitempty"`
	ToolName       string                 `json:"toolName,omitempty"`
	Content        string                 `json:"content,omitempty"`
	ConfirmationID string                 `json:"confirmationId,omitempty"`
	Metadata       map[string]any         `json:"metadata,omitempty"`
	Citations      []models.AgentCitation `json:"citations,omitempty"`
}

type RunInput struct {
	UserID              uint
	ConversationID      uint
	UserMessage         string
	WorkflowTemplateKey string
	WorkflowPresetID    *uint
	KnowledgeSpaceIDs   []uint
	WorkflowInputs      map[string]any
	ForcedTool          string
	Provider            llm.ProviderConfig
	RAGProvider         rag.ProviderConfig
}

type RunResult struct {
	Content    string
	RunSummary models.AgentRunSummary
}
