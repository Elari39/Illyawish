package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/provider"

	"gorm.io/gorm"
)

const (
	defaultConversationTitle = "New chat"
	defaultSystemPrompt      = "You are a helpful assistant."
)

var (
	defaultTemperature        = float32(1)
	ErrConversationBusy       = errors.New("conversation is already generating a reply")
	ErrNoActiveGeneration     = errors.New("no active generation for this conversation")
	ErrInvalidAssistantAction = errors.New("only the latest assistant reply can be retried or regenerated")
	ErrInvalidUserEdit        = errors.New("only the latest user message can be edited")
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
	db        *gorm.DB
	model     llm.ChatModel
	providers providerResolver
	uploads   attachmentStore

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

type StreamEvent struct {
	Type    string      `json:"type"`
	Content string      `json:"content,omitempty"`
	Message *MessageDTO `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
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
	SystemPrompt string   `json:"systemPrompt"`
	Model        string   `json:"model"`
	Temperature  *float32 `json:"temperature"`
	MaxTokens    *int     `json:"maxTokens"`
}

type ConversationUpdateInput struct {
	Title      *string               `json:"title"`
	IsPinned   *bool                 `json:"isPinned"`
	IsArchived *bool                 `json:"isArchived"`
	Settings   *ConversationSettings `json:"settings"`
}

type SendMessageInput struct {
	Content     string                `json:"content"`
	Attachments []models.Attachment   `json:"attachments"`
	Options     *ConversationSettings `json:"options"`
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

func (s *Service) ListConversations(
	userID uint,
	params ListConversationsParams,
) (*ConversationListResult, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	query := s.db.Model(&models.Conversation{}).
		Where("user_id = ? AND is_archived = ?", userID, params.Archived)

	search := strings.TrimSpace(params.Search)
	if search != "" {
		like := "%" + escapeLike(search) + "%"
		query = query.Where("title LIKE ? ESCAPE '\\'", like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("count conversations: %w", err)
	}

	var conversations []models.Conversation
	if err := query.
		Order("is_pinned desc").
		Order("updated_at desc").
		Offset(maxInt(params.Offset, 0)).
		Limit(limit).
		Find(&conversations).Error; err != nil {
		return nil, fmt.Errorf("list conversations: %w", err)
	}

	for index := range conversations {
		s.applyConversationDefaults(&conversations[index])
	}

	return &ConversationListResult{
		Conversations: conversations,
		Total:         total,
	}, nil
}

func (s *Service) CreateConversation(userID uint) (*models.Conversation, error) {
	temperature := defaultTemperature
	conversation := &models.Conversation{
		UserID:       userID,
		Title:        defaultConversationTitle,
		SystemPrompt: defaultSystemPrompt,
		Temperature:  &temperature,
	}
	if err := s.db.Create(conversation).Error; err != nil {
		return nil, fmt.Errorf("create conversation: %w", err)
	}
	return conversation, nil
}

func (s *Service) GetConversation(userID uint, conversationID uint) (*models.Conversation, error) {
	var conversation models.Conversation
	if err := s.db.Where("id = ? AND user_id = ?", conversationID, userID).First(&conversation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("get conversation: %w", err)
	}
	s.applyConversationDefaults(&conversation)
	return &conversation, nil
}

func (s *Service) UpdateConversation(
	userID uint,
	conversationID uint,
	input ConversationUpdateInput,
) (*models.Conversation, error) {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"updated_at": time.Now(),
	}

	if input.Title != nil {
		title := strings.TrimSpace(*input.Title)
		if title == "" {
			return nil, requestError{message: "conversation title is required"}
		}
		updates["title"] = title
	}
	if input.IsPinned != nil {
		updates["is_pinned"] = *input.IsPinned
	}
	if input.IsArchived != nil {
		updates["is_archived"] = *input.IsArchived
	}
	if input.Settings != nil {
		settings, err := s.resolveSettings(conversation, input.Settings, "")
		if err != nil {
			return nil, err
		}
		updates["system_prompt"] = settings.SystemPrompt
		updates["model"] = settings.Model
		updates["temperature"] = settings.Temperature
		updates["max_tokens"] = settings.MaxTokens
	}

	if err := s.db.Model(conversation).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update conversation: %w", err)
	}

	return s.GetConversation(userID, conversationID)
}

func (s *Service) DeleteConversation(userID uint, conversationID uint) error {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	messages, err := s.ListMessages(userID, conversationID)
	if err != nil {
		return err
	}

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("conversation_id = ?", conversation.ID).Delete(&models.Message{}).Error; err != nil {
			return fmt.Errorf("delete conversation messages: %w", err)
		}
		if err := tx.Delete(&models.Conversation{}, conversation.ID).Error; err != nil {
			return fmt.Errorf("delete conversation: %w", err)
		}
		return nil
	}); err != nil {
		return err
	}

	return s.cleanupAttachments(messages)
}

func (s *Service) cleanupAttachments(messages []models.Message) error {
	if s.uploads == nil {
		return nil
	}
	return s.uploads.CleanupUnreferenced(collectMessageAttachments(messages))
}

func (s *Service) ListMessages(userID uint, conversationID uint) ([]models.Message, error) {
	if _, err := s.GetConversation(userID, conversationID); err != nil {
		return nil, err
	}

	var messages []models.Message
	if err := s.db.Where("conversation_id = ?", conversationID).Order("id asc").Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	return messages, nil
}

func (s *Service) CancelGeneration(userID uint, conversationID uint) error {
	if _, err := s.GetConversation(userID, conversationID); err != nil {
		return err
	}

	s.activeMu.Lock()
	cancel, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()

	if !exists {
		return ErrNoActiveGeneration
	}

	cancel()
	return nil
}

func (s *Service) StreamAssistantReply(
	ctx context.Context,
	userID uint,
	conversationID uint,
	input SendMessageInput,
	emit func(StreamEvent) error,
) error {
	normalizedInput, err := s.normalizeSendInput(userID, input)
	if err != nil {
		return err
	}

	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	resolvedProvider, err := s.providers.ResolveForUser(userID)
	if err != nil {
		return err
	}
	settings, err := s.resolveSettings(conversation, normalizedInput.Options, resolvedProvider.Config.DefaultModel)
	if err != nil {
		return err
	}

	ctx, cleanup, err := s.registerActiveStream(ctx, conversation.ID)
	if err != nil {
		return err
	}
	defer cleanup()

	var assistantMessage models.Message
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		userMessage := models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleUser,
			Content:        normalizedInput.Content,
			Attachments:    normalizedInput.Attachments,
			Status:         models.MessageStatusCompleted,
		}
		if err := tx.Create(&userMessage).Error; err != nil {
			return fmt.Errorf("create user message: %w", err)
		}

		if strings.TrimSpace(conversation.Title) == "" || conversation.Title == defaultConversationTitle {
			title := deriveConversationTitle(normalizedInput.Content, normalizedInput.Attachments)
			if err := tx.Model(conversation).Updates(map[string]any{
				"title":      title,
				"updated_at": time.Now(),
			}).Error; err != nil {
				return fmt.Errorf("update conversation title: %w", err)
			}
			conversation.Title = title
		}

		assistantMessage = models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleAssistant,
			Content:        "",
			Status:         models.MessageStatusStreaming,
		}
		if err := tx.Create(&assistantMessage).Error; err != nil {
			return fmt.Errorf("create assistant placeholder: %w", err)
		}

		if err := tx.Model(conversation).Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	return s.streamIntoAssistantMessage(ctx, &assistantMessage, resolvedProvider.Config, history, settings, emit)
}

func (s *Service) RetryAssistantMessage(
	ctx context.Context,
	userID uint,
	conversationID uint,
	assistantMessageID uint,
	options *ConversationSettings,
	emit func(StreamEvent) error,
) error {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	resolvedProvider, err := s.providers.ResolveForUser(userID)
	if err != nil {
		return err
	}
	settings, err := s.resolveSettings(conversation, options, resolvedProvider.Config.DefaultModel)
	if err != nil {
		return err
	}

	ctx, cleanup, err := s.registerActiveStream(ctx, conversation.ID)
	if err != nil {
		return err
	}
	defer cleanup()

	assistantMessage, err := s.prepareAssistantRetry(conversation.ID, assistantMessageID)
	if err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	return s.streamIntoAssistantMessage(ctx, assistantMessage, resolvedProvider.Config, history, settings, emit)
}

func (s *Service) RegenerateLastAssistantReply(
	ctx context.Context,
	userID uint,
	conversationID uint,
	options *ConversationSettings,
	emit func(StreamEvent) error,
) error {
	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	latestMessage, err := latestConversationMessage(s.db, conversation.ID)
	if err != nil {
		return err
	}
	if latestMessage.Role != models.RoleAssistant {
		return ErrInvalidAssistantAction
	}

	return s.RetryAssistantMessage(ctx, userID, conversationID, latestMessage.ID, options, emit)
}

func (s *Service) EditUserMessageAndRegenerate(
	ctx context.Context,
	userID uint,
	conversationID uint,
	messageID uint,
	input SendMessageInput,
	emit func(StreamEvent) error,
) error {
	normalizedInput, err := s.normalizeSendInput(userID, input)
	if err != nil {
		return err
	}

	conversation, err := s.GetConversation(userID, conversationID)
	if err != nil {
		return err
	}

	resolvedProvider, err := s.providers.ResolveForUser(userID)
	if err != nil {
		return err
	}
	settings, err := s.resolveSettings(conversation, normalizedInput.Options, resolvedProvider.Config.DefaultModel)
	if err != nil {
		return err
	}

	ctx, cleanup, err := s.registerActiveStream(ctx, conversation.ID)
	if err != nil {
		return err
	}
	defer cleanup()

	var (
		assistantMessage models.Message
		cleanupMessages  []models.Message
	)
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		message, err := conversationMessageByID(tx, conversation.ID, messageID)
		if err != nil {
			return err
		}
		if message.Role != models.RoleUser {
			return ErrInvalidUserEdit
		}

		latestUserMessage, err := latestConversationMessageByRole(tx, conversation.ID, models.RoleUser)
		if err != nil {
			return err
		}
		if latestUserMessage.ID != message.ID {
			return ErrInvalidUserEdit
		}

		var trailingMessages []models.Message
		if err := tx.Where("conversation_id = ? AND id >= ?", conversation.ID, message.ID).
			Order("id asc").
			Find(&trailingMessages).Error; err != nil {
			return fmt.Errorf("load trailing messages: %w", err)
		}
		cleanupMessages = trailingMessages

		if err := tx.Model(message).Updates(map[string]any{
			"content":     normalizedInput.Content,
			"attachments": normalizedInput.Attachments,
			"status":      models.MessageStatusCompleted,
		}).Error; err != nil {
			return fmt.Errorf("update user message: %w", err)
		}

		if err := tx.Where("conversation_id = ? AND id > ?", conversation.ID, message.ID).Delete(&models.Message{}).Error; err != nil {
			return fmt.Errorf("delete trailing messages: %w", err)
		}

		if strings.TrimSpace(conversation.Title) == "" || conversation.Title == defaultConversationTitle {
			title := deriveConversationTitle(normalizedInput.Content, normalizedInput.Attachments)
			if err := tx.Model(conversation).Updates(map[string]any{
				"title":      title,
				"updated_at": time.Now(),
			}).Error; err != nil {
				return fmt.Errorf("update conversation title: %w", err)
			}
			conversation.Title = title
		}

		assistantMessage = models.Message{
			ConversationID: conversation.ID,
			Role:           models.RoleAssistant,
			Content:        "",
			Status:         models.MessageStatusStreaming,
		}
		if err := tx.Create(&assistantMessage).Error; err != nil {
			return fmt.Errorf("create assistant placeholder: %w", err)
		}

		if err := tx.Model(conversation).Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	if err := s.cleanupAttachments(cleanupMessages); err != nil {
		return err
	}

	history, err := s.historyForModel(conversation.ID, assistantMessage.ID, settings.SystemPrompt)
	if err != nil {
		return err
	}

	return s.streamIntoAssistantMessage(ctx, &assistantMessage, resolvedProvider.Config, history, settings, emit)
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
		return nil, requestError{message: "message content or image attachment is required"}
	}

	var options *ConversationSettings
	if input.Options != nil {
		normalizedOptions, err := sanitizeSettings(input.Options)
		if err != nil {
			return nil, err
		}
		options = &normalizedOptions
	}

	return &SendMessageInput{
		Content:     content,
		Attachments: attachments,
		Options:     options,
	}, nil
}

func (s *Service) resolveSettings(
	conversation *models.Conversation,
	override *ConversationSettings,
	defaultModel string,
) (ConversationSettings, error) {
	settings := ConversationSettings{
		SystemPrompt: strings.TrimSpace(conversation.SystemPrompt),
		Model:        strings.TrimSpace(conversation.Model),
		Temperature:  cloneFloat32(conversation.Temperature),
		MaxTokens:    cloneInt(conversation.MaxTokens),
	}

	if override != nil {
		normalizedOverride, err := sanitizeSettings(override)
		if err != nil {
			return ConversationSettings{}, err
		}
		settings.SystemPrompt = normalizedOverride.SystemPrompt
		settings.Model = normalizedOverride.Model
		settings.Temperature = normalizedOverride.Temperature
		settings.MaxTokens = normalizedOverride.MaxTokens
	}

	if settings.SystemPrompt == "" {
		settings.SystemPrompt = defaultSystemPrompt
	}
	if settings.Model == "" {
		settings.Model = strings.TrimSpace(defaultModel)
	}
	if settings.Temperature == nil {
		settings.Temperature = ptrFloat32(defaultTemperature)
	}

	return settings, nil
}

func sanitizeSettings(settings *ConversationSettings) (ConversationSettings, error) {
	normalized := ConversationSettings{}
	if settings == nil {
		return normalized, nil
	}

	normalized.SystemPrompt = strings.TrimSpace(settings.SystemPrompt)
	normalized.Model = strings.TrimSpace(settings.Model)

	if settings.Temperature != nil {
		if *settings.Temperature < 0 || *settings.Temperature > 2 {
			return ConversationSettings{}, requestError{message: "temperature must be between 0 and 2"}
		}
		normalized.Temperature = ptrFloat32(*settings.Temperature)
	}

	if settings.MaxTokens != nil {
		if *settings.MaxTokens < 0 {
			return ConversationSettings{}, requestError{message: "max tokens must be greater than or equal to 0"}
		}
		if *settings.MaxTokens > 0 {
			normalized.MaxTokens = ptrInt(*settings.MaxTokens)
		}
	}

	return normalized, nil
}

func (s *Service) prepareAssistantRetry(conversationID uint, assistantMessageID uint) (*models.Message, error) {
	var assistantMessage models.Message
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		message, err := conversationMessageByID(tx, conversationID, assistantMessageID)
		if err != nil {
			return err
		}
		if message.Role != models.RoleAssistant {
			return ErrInvalidAssistantAction
		}

		latestMessage, err := latestConversationMessage(tx, conversationID)
		if err != nil {
			return err
		}
		if latestMessage.ID != message.ID {
			return ErrInvalidAssistantAction
		}

		if _, err := previousUserMessage(tx, conversationID, message.ID); err != nil {
			return ErrInvalidAssistantAction
		}

		if err := tx.Model(message).Updates(map[string]any{
			"content":     "",
			"attachments": []models.Attachment{},
			"status":      models.MessageStatusStreaming,
		}).Error; err != nil {
			return fmt.Errorf("reset assistant message: %w", err)
		}

		if err := tx.Model(&models.Conversation{}).
			Where("id = ?", conversationID).
			Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("touch conversation: %w", err)
		}

		assistantMessage = *message
		assistantMessage.Content = ""
		assistantMessage.Attachments = nil
		assistantMessage.Status = models.MessageStatusStreaming
		return nil
	}); err != nil {
		return nil, err
	}

	return &assistantMessage, nil
}

func (s *Service) streamIntoAssistantMessage(
	ctx context.Context,
	assistantMessage *models.Message,
	providerConfig llm.ProviderConfig,
	history []llm.ChatMessage,
	settings ConversationSettings,
	emit func(StreamEvent) error,
) error {
	if err := emit(StreamEvent{
		Type:    "message_start",
		Message: ToMessageDTO(assistantMessage),
	}); err != nil {
		return err
	}

	var streamedContent strings.Builder
	fullText, streamErr := s.model.Stream(ctx, providerConfig, history, llm.RequestOptions{
		Model:       settings.Model,
		Temperature: cloneFloat32(settings.Temperature),
		MaxTokens:   cloneInt(settings.MaxTokens),
	}, func(delta string) {
		streamedContent.WriteString(delta)
		_ = emit(StreamEvent{
			Type:    "delta",
			Content: delta,
		})
	})

	finalContent := fullText
	if finalContent == "" {
		finalContent = streamedContent.String()
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
			Message: ToMessageDTO(assistantMessage),
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
		Message: ToMessageDTO(assistantMessage),
	})
}

func (s *Service) historyForModel(
	conversationID uint,
	beforeMessageID uint,
	systemPrompt string,
) ([]llm.ChatMessage, error) {
	query := s.db.Where("conversation_id = ?", conversationID).Order("id asc")
	if beforeMessageID > 0 {
		query = query.Where("id < ?", beforeMessageID)
	}

	var messages []models.Message
	if err := query.Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("load conversation history: %w", err)
	}

	history := []llm.ChatMessage{
		{
			Role:    models.RoleSystem,
			Content: systemPrompt,
		},
	}

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
	if strings.TrimSpace(conversation.SystemPrompt) == "" {
		conversation.SystemPrompt = defaultSystemPrompt
	}
	if conversation.Temperature == nil {
		conversation.Temperature = ptrFloat32(defaultTemperature)
	}
}

func includeMessageInHistory(message models.Message) bool {
	if message.Role == models.RoleAssistant && message.Status != models.MessageStatusCompleted {
		return false
	}
	return strings.TrimSpace(message.Content) != "" || len(message.Attachments) > 0
}

func deriveConversationTitle(content string, attachments []models.Attachment) string {
	content = strings.TrimSpace(content)
	if content == "" && len(attachments) > 0 {
		title := strings.TrimSpace(attachments[0].Name)
		if title == "" {
			return "Image chat"
		}
		content = "Image: " + title
	}
	if content == "" {
		return defaultConversationTitle
	}

	const maxRunes = 30
	if utf8.RuneCountInString(content) <= maxRunes {
		return content
	}

	runes := []rune(content)
	return string(runes[:maxRunes]) + "..."
}

func conversationMessageByID(tx *gorm.DB, conversationID uint, messageID uint) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ? AND id = ?", conversationID, messageID).First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load message: %w", err)
	}
	return &message, nil
}

func latestConversationMessage(tx *gorm.DB, conversationID uint) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ?", conversationID).Order("id desc").First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load latest message: %w", err)
	}
	return &message, nil
}

func latestConversationMessageByRole(
	tx *gorm.DB,
	conversationID uint,
	role string,
) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ? AND role = ?", conversationID, role).
		Order("id desc").
		First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load latest %s message: %w", role, err)
	}
	return &message, nil
}

func previousUserMessage(tx *gorm.DB, conversationID uint, beforeMessageID uint) (*models.Message, error) {
	var message models.Message
	if err := tx.Where("conversation_id = ? AND role = ? AND id < ?", conversationID, models.RoleUser, beforeMessageID).
		Order("id desc").
		First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("load previous user message: %w", err)
	}
	return &message, nil
}

func escapeLike(input string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_")
	return replacer.Replace(input)
}

func cloneFloat32(value *float32) *float32 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func ptrFloat32(value float32) *float32 {
	return &value
}

func ptrInt(value int) *int {
	return &value
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func collectMessageAttachments(messages []models.Message) []models.Attachment {
	attachments := make([]models.Attachment, 0)
	for _, message := range messages {
		attachments = append(attachments, message.Attachments...)
	}
	return attachments
}
