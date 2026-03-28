package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

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
	ResolveForUser(userID uint) (*provider.ResolvedProvider, error)
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
	Model              string   `json:"model"`
	Temperature        *float32 `json:"temperature"`
	MaxTokens          *int     `json:"maxTokens"`
	ContextWindowTurns *int     `json:"contextWindowTurns"`
}

type ChatSettings struct {
	GlobalPrompt       string   `json:"globalPrompt"`
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
	WorkflowPresetID  *uint                 `json:"workflowPresetId"`
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

func (s *Service) GetChatSettings(userID uint) (ChatSettings, error) {
	var user models.User
	if err := s.db.
		Select(
			"global_prompt",
			"default_model",
			"default_temperature",
			"default_max_tokens",
			"default_context_window_turns",
		).
		First(&user, userID).Error; err != nil {
		return ChatSettings{}, fmt.Errorf("get chat settings: %w", err)
	}

	return applyChatSettingsDefaults(ChatSettings{
		GlobalPrompt:       strings.TrimSpace(user.GlobalPrompt),
		Model:              strings.TrimSpace(user.DefaultModel),
		Temperature:        cloneFloat32(user.DefaultTemperature),
		MaxTokens:          cloneInt(user.DefaultMaxTokens),
		ContextWindowTurns: cloneInt(user.DefaultContextWindowTurns),
	}), nil
}

func (s *Service) UpdateChatSettings(userID uint, input ChatSettings) (ChatSettings, error) {
	settings, err := sanitizeChatSettings(input)
	if err != nil {
		return ChatSettings{}, err
	}

	if err := s.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]any{
			"global_prompt":                settings.GlobalPrompt,
			"default_model":                settings.Model,
			"default_temperature":          settings.Temperature,
			"default_max_tokens":           settings.MaxTokens,
			"default_context_window_turns": settings.ContextWindowTurns,
		}).Error; err != nil {
		return ChatSettings{}, fmt.Errorf("update chat settings: %w", err)
	}

	return applyChatSettingsDefaults(settings), nil
}

func (s *Service) resolveSettings(
	userID uint,
	conversation *models.Conversation,
	override *ConversationSettings,
	defaultModel string,
) (ConversationSettings, error) {
	settings, err := s.effectiveConversationSettings(userID, conversation)
	if err != nil {
		return ConversationSettings{}, err
	}

	if override != nil {
		normalizedOverride, err := sanitizeConversationSettings(override)
		if err != nil {
			return ConversationSettings{}, err
		}
		settings.SystemPrompt = normalizedOverride.SystemPrompt
		if normalizedOverride.Model != "" {
			settings.Model = normalizedOverride.Model
		}
		if normalizedOverride.Temperature != nil {
			settings.Temperature = cloneFloat32(normalizedOverride.Temperature)
		}
		if normalizedOverride.MaxTokens != nil {
			settings.MaxTokens = cloneInt(normalizedOverride.MaxTokens)
		}
		if normalizedOverride.ContextWindowTurns != nil {
			settings.ContextWindowTurns = cloneInt(normalizedOverride.ContextWindowTurns)
		}
	}

	if settings.Model == "" {
		settings.Model = strings.TrimSpace(defaultModel)
	}
	if settings.Temperature == nil {
		settings.Temperature = ptrFloat32(defaultTemperature)
	}

	return settings, nil
}

func (s *Service) resolveSystemPrompt(userID uint, sessionPrompt string) (string, error) {
	sessionPrompt = strings.TrimSpace(sessionPrompt)
	if sessionPrompt != "" {
		return sessionPrompt, nil
	}

	settings, err := s.GetChatSettings(userID)
	if err != nil {
		return "", err
	}

	return settings.GlobalPrompt, nil
}

func (s *Service) prepareAssistantReplay(
	conversationID uint,
	assistantMessageID uint,
	invalidAction error,
	allowedStatuses ...string,
) (*models.Message, []models.Message, error) {
	var (
		assistantMessage models.Message
		cleanupMessages  []models.Message
	)
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		message, err := conversationMessageByID(tx, conversationID, assistantMessageID)
		if err != nil {
			return err
		}
		if message.Role != models.RoleAssistant {
			return invalidAction
		}
		if len(allowedStatuses) > 0 && !containsStatus(allowedStatuses, message.Status) {
			return invalidAction
		}

		if _, err := previousUserMessage(tx, conversationID, message.ID); err != nil {
			return invalidAction
		}

		var trailingMessages []models.Message
		if err := tx.Where("conversation_id = ? AND id >= ?", conversationID, message.ID).
			Order("id asc").
			Find(&trailingMessages).Error; err != nil {
			return fmt.Errorf("load trailing messages: %w", err)
		}
		if err := hydrateMessageAttachments(tx, trailingMessages); err != nil {
			return err
		}
		cleanupMessages = trailingMessages

		if err := updateMessageRecord(
			tx,
			message,
			"",
			nil,
			models.MessageStatusStreaming,
		); err != nil {
			return fmt.Errorf("reset assistant message: %w", err)
		}

		if err := tx.Where("conversation_id = ? AND id > ?", conversationID, message.ID).
			Delete(&models.Message{}).Error; err != nil {
			return fmt.Errorf("delete trailing messages: %w", err)
		}

		if err := tx.Model(&models.Conversation{}).
			Where("id = ?", conversationID).
			Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
		}

		assistantMessage = *message
		assistantMessage.Content = ""
		assistantMessage.LegacyAttachments = nil
		assistantMessage.Attachments = nil
		assistantMessage.Status = models.MessageStatusStreaming
		return nil
	}); err != nil {
		return nil, nil, err
	}

	return &assistantMessage, cleanupMessages, nil
}

func (s *Service) streamIntoAssistantMessage(
	ctx context.Context,
	assistantMessage *models.Message,
	conversationPublicID string,
	providerConfig llm.ProviderConfig,
	history []llm.ChatMessage,
	settings ConversationSettings,
	emit func(StreamEvent) error,
) error {
	if err := emit(StreamEvent{
		Type:    "message_start",
		Message: ToMessageDTO(assistantMessage, conversationPublicID),
	}); err != nil {
		return err
	}

	streamOptions := llm.RequestOptions{
		Model:       settings.Model,
		Temperature: cloneFloat32(settings.Temperature),
		MaxTokens:   cloneInt(settings.MaxTokens),
	}

	accumulatedContent := ""
	streamResult, streamErr := s.model.Stream(ctx, providerConfig, history, streamOptions, func(delta string) {
		accumulatedContent += delta
		_ = emit(StreamEvent{
			Type:    "delta",
			Content: delta,
		})
	})

	finalContent := streamResult.Content
	if finalContent == "" {
		finalContent = accumulatedContent
	}

	if shouldAutoContinue(streamResult, streamErr) {
		continueHistory := append(history, llm.ChatMessage{
			Role:    models.RoleAssistant,
			Content: finalContent,
		}, llm.ChatMessage{
			Role:    models.RoleUser,
			Content: continueAssistantPrompt,
		})

		continueResult, continueErr := s.model.Stream(ctx, providerConfig, continueHistory, streamOptions, func(delta string) {
			finalContent += delta
			_ = emit(StreamEvent{
				Type:    "delta",
				Content: delta,
			})
		})
		if continueResult.Content != "" && !strings.HasSuffix(finalContent, continueResult.Content) {
			finalContent += continueResult.Content
		}
		streamResult = continueResult
		streamErr = continueErr
	}

	if streamErr != nil {
		status := models.MessageStatusFailed
		eventType := "error"
		if errors.Is(streamErr, context.Canceled) {
			status = models.MessageStatusCancelled
			eventType = "cancelled"
		}

		if err := s.db.Model(assistantMessage).Updates(map[string]any{
			"content": finalContent,
			"status":  status,
		}).Error; err != nil {
			return fmt.Errorf("finalize assistant message: %w", err)
		}

		assistantMessage.Content = finalContent
		assistantMessage.Status = status
		_ = emit(StreamEvent{
			Type:    eventType,
			Error:   streamErr.Error(),
			Message: ToMessageDTO(assistantMessage, conversationPublicID),
		})
		return nil
	}

	if err := s.db.Model(assistantMessage).Updates(map[string]any{
		"content": finalContent,
		"status":  models.MessageStatusCompleted,
	}).Error; err != nil {
		return fmt.Errorf("complete assistant message: %w", err)
	}

	assistantMessage.Content = finalContent
	assistantMessage.Status = models.MessageStatusCompleted
	return emit(StreamEvent{
		Type:    "done",
		Message: ToMessageDTO(assistantMessage, conversationPublicID),
	})
}

func (s *Service) historyForModel(
	conversationID uint,
	beforeMessageID uint,
	systemPrompt string,
	contextWindowTurns *int,
) ([]llm.ChatMessage, error) {
	query := s.db.Where("conversation_id = ?", conversationID).Order("id asc")
	if beforeMessageID > 0 {
		query = query.Where("id < ?", beforeMessageID)
	}

	var messages []models.Message
	if err := query.Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("load conversation history: %w", err)
	}
	if err := hydrateMessageAttachments(s.db, messages); err != nil {
		return nil, err
	}

	history := make([]llm.ChatMessage, 0, len(messages))

	for _, message := range messages {
		if !includeMessageInHistory(message) {
			continue
		}

		modelAttachments := []llm.Attachment{}
		if len(message.Attachments) > 0 {
			if s.uploads == nil {
				return nil, requestError{message: "attachments are unavailable"}
			}

			var err error
			modelAttachments, err = s.uploads.BuildModelAttachments(message.Attachments)
			if err != nil {
				return nil, err
			}
		}
		history = append(history, llm.ChatMessage{
			Role:        message.Role,
			Content:     message.Content,
			Attachments: modelAttachments,
		})
	}

	history = trimHistoryToRecentTurns(history, contextWindowTurns)
	if strings.TrimSpace(systemPrompt) != "" {
		history = append([]llm.ChatMessage{{
			Role:    models.RoleSystem,
			Content: systemPrompt,
		}}, history...)
	}

	return history, nil
}

func (s *Service) registerActiveStream(
	parent context.Context,
	conversationID uint,
) (context.Context, func(), error) {
	ctx, cancel := context.WithCancel(parent)

	s.activeMu.Lock()
	if _, exists := s.activeStreams[conversationID]; exists {
		s.activeMu.Unlock()
		cancel()
		return nil, nil, ErrConversationBusy
	}
	s.activeStreams[conversationID] = cancel
	s.activeMu.Unlock()

	cleanup := func() {
		s.activeMu.Lock()
		delete(s.activeStreams, conversationID)
		s.activeMu.Unlock()
		cancel()
	}

	return ctx, cleanup, nil
}

func (s *Service) applyConversationDefaults(conversation *models.Conversation) {
	if conversation == nil {
		return
	}
	if strings.TrimSpace(conversation.Title) == "" {
		conversation.Title = defaultConversationTitle
	}
	if conversation.Tags == nil {
		conversation.Tags = []string{}
	}
}

func (s *Service) effectiveConversationSettings(
	userID uint,
	conversation *models.Conversation,
) (ConversationSettings, error) {
	chatSettings, err := s.GetChatSettings(userID)
	if err != nil {
		return ConversationSettings{}, err
	}

	return ConversationSettings{
		SystemPrompt:       strings.TrimSpace(conversation.SystemPrompt),
		Model:              firstNonEmptyString(strings.TrimSpace(conversation.Model), strings.TrimSpace(chatSettings.Model)),
		Temperature:        firstNonNilFloat32(conversation.Temperature, chatSettings.Temperature),
		MaxTokens:          firstNonNilInt(conversation.MaxTokens, chatSettings.MaxTokens),
		ContextWindowTurns: firstNonNilInt(conversation.ContextWindowTurns, chatSettings.ContextWindowTurns),
	}, nil
}
