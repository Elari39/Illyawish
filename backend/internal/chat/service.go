package chat

import (
	"context"
	"errors"
	"strings"
	"sync"

	"backend/internal/agent"
	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/provider"

	"gorm.io/gorm"
)

const (
	defaultConversationTitle = "New chat"
	continueAssistantPrompt  = "Continue exactly where the previous assistant response stopped. Do not repeat or restart."
)

var (
	defaultTemperature         = float32(1)
	ErrConversationBusy        = errors.New("conversation is already generating a reply")
	ErrNoActiveGeneration      = errors.New("no active generation for this conversation")
	ErrInvalidRetryAction      = errors.New("assistant message cannot be retried")
	ErrInvalidRegenerateAction = errors.New("assistant message cannot be regenerated")
	ErrInvalidUserEdit         = errors.New("only the latest user message can be edited")
)

type requestError struct {
	message string
}

func (e requestError) Error() string {
	return e.message
}

func isRequestError(err error) bool {
	var target requestError
	return errors.As(err, &target)
}

type Service struct {
	db              *gorm.DB
	model           llm.ChatModel
	providers       providerResolver
	uploads         attachmentStore
	agent           agentRunner
	workflowPresets workflowPresetResolver

	activeMu      sync.Mutex
	activeStreams map[uint]context.CancelFunc
}

type providerResolver interface {
	ResolveForUser(userID uint, preferredPresetID *uint) (*provider.ResolvedProvider, error)
}

type attachmentStore interface {
	ValidateForUser(userID uint, attachments []models.Attachment) ([]models.Attachment, error)
	BuildModelAttachments(attachments []models.Attachment) ([]llm.Attachment, error)
	CleanupUnreferenced(attachments []models.Attachment) error
}

type agentRunner interface {
	Execute(context.Context, agent.RunInput, func(agent.Event) error) (*agent.RunResult, error)
}

type workflowPresetResolver interface {
	GetPreset(userID uint, presetID uint) (*models.WorkflowPreset, error)
}

type StreamEvent struct {
	Type           string                 `json:"type"`
	Content        string                 `json:"content,omitempty"`
	Message        *MessageDTO            `json:"message,omitempty"`
	Error          string                 `json:"error,omitempty"`
	StepName       string                 `json:"stepName,omitempty"`
	ToolName       string                 `json:"toolName,omitempty"`
	ConfirmationID string                 `json:"confirmationId,omitempty"`
	Citations      []models.AgentCitation `json:"citations,omitempty"`
	Metadata       map[string]any         `json:"metadata,omitempty"`
}

type ListConversationsParams struct {
	Search   string
	Archived bool
	Limit    int
	Offset   int
}

type ConversationListResult struct {
	Conversations []models.Conversation
	Total         int64
}

type ConversationSettings struct {
	SystemPrompt       string   `json:"systemPrompt"`
	ProviderPresetID   *uint    `json:"providerPresetId"`
	Model              string   `json:"model"`
	Temperature        *float32 `json:"temperature"`
	MaxTokens          *int     `json:"maxTokens"`
	ContextWindowTurns *int     `json:"contextWindowTurns"`
}

type ChatSettings struct {
	GlobalPrompt       string   `json:"globalPrompt"`
	ProviderPresetID   *uint    `json:"providerPresetId"`
	Model              string   `json:"model"`
	Temperature        *float32 `json:"temperature"`
	MaxTokens          *int     `json:"maxTokens"`
	ContextWindowTurns *int     `json:"contextWindowTurns"`
}

type ConversationUpdateInput struct {
	Title             *string               `json:"title"`
	IsPinned          *bool                 `json:"isPinned"`
	IsArchived        *bool                 `json:"isArchived"`
	Folder            *string               `json:"folder"`
	Tags              *[]string             `json:"tags"`
	WorkflowPresetID  optionalNullableUint  `json:"workflowPresetId"`
	KnowledgeSpaceIDs *[]uint               `json:"knowledgeSpaceIds"`
	Settings          *ConversationSettings `json:"settings"`
}

type CreateConversationInput struct {
	Folder            *string               `json:"folder"`
	Tags              *[]string             `json:"tags"`
	WorkflowPresetID  *uint                 `json:"workflowPresetId"`
	KnowledgeSpaceIDs *[]uint               `json:"knowledgeSpaceIds"`
	Settings          *ConversationSettings `json:"settings"`
}

type ImportMessageInput struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ImportConversationInput struct {
	Title             string                `json:"title"`
	WorkflowPresetID  *uint                 `json:"workflowPresetId"`
	KnowledgeSpaceIDs *[]uint               `json:"knowledgeSpaceIds"`
	Settings          *ConversationSettings `json:"settings"`
	Messages          []ImportMessageInput  `json:"messages"`
}

type SendMessageInput struct {
	Content           string                `json:"content"`
	Attachments       []models.Attachment   `json:"attachments"`
	Options           *ConversationSettings `json:"options"`
	WorkflowPresetID  *uint                 `json:"workflowPresetId"`
	WorkflowInputs    map[string]any        `json:"workflowInputs"`
	KnowledgeSpaceIDs []uint                `json:"knowledgeSpaceIds"`
}

func NewService(
	db *gorm.DB,
	model llm.ChatModel,
	providers providerResolver,
	uploads attachmentStore,
) *Service {
	return &Service{
		db:            db,
		model:         model,
		providers:     providers,
		uploads:       uploads,
		activeStreams: map[uint]context.CancelFunc{},
	}
}

func (s *Service) WithAgentRuntime(runtime agentRunner) *Service {
	s.agent = runtime
	return s
}

func (s *Service) WithWorkflowPresets(resolver workflowPresetResolver) *Service {
	s.workflowPresets = resolver
	return s
}

func (s *Service) normalizeSendInput(userID uint, input SendMessageInput) (*SendMessageInput, error) {
	content := strings.TrimSpace(input.Content)
	attachments := []models.Attachment{}
	if len(input.Attachments) > 0 {
		if s.uploads == nil {
			return nil, requestError{message: "attachments are unavailable"}
		}

		var err error
		attachments, err = s.uploads.ValidateForUser(userID, input.Attachments)
		if err != nil {
			return nil, err
		}
	}
	if content == "" && len(attachments) == 0 {
		return nil, requestError{message: "message content or attachment is required"}
	}
	if err := s.enforceAttachmentQuota(userID, len(attachments)); err != nil {
		return nil, err
	}

	var options *ConversationSettings
	if input.Options != nil {
		normalizedOptions, err := sanitizeConversationSettings(input.Options)
		if err != nil {
			return nil, err
		}
		options = &normalizedOptions
	}

	return &SendMessageInput{
		Content:           content,
		Attachments:       attachments,
		Options:           options,
		WorkflowPresetID:  input.WorkflowPresetID,
		WorkflowInputs:    input.WorkflowInputs,
		KnowledgeSpaceIDs: cloneUintSlice(input.KnowledgeSpaceIDs),
	}, nil
}
