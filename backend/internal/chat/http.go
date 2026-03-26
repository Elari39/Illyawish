package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"backend/internal/auth"
	"backend/internal/models"
	"backend/internal/provider"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	service *Service
}

type ConversationDTO struct {
	ID         uint                    `json:"id"`
	Title      string                  `json:"title"`
	IsPinned   bool                    `json:"isPinned"`
	IsArchived bool                    `json:"isArchived"`
	Settings   ConversationSettingsDTO `json:"settings"`
	CreatedAt  string                  `json:"createdAt"`
	UpdatedAt  string                  `json:"updatedAt"`
}

type ConversationSettingsDTO struct {
	SystemPrompt       string   `json:"systemPrompt"`
	Model              string   `json:"model"`
	Temperature        *float32 `json:"temperature"`
	MaxTokens          *int     `json:"maxTokens"`
	ContextWindowTurns *int     `json:"contextWindowTurns"`
}

type ChatSettingsDTO struct {
	GlobalPrompt       string   `json:"globalPrompt"`
	Model              string   `json:"model"`
	Temperature        *float32 `json:"temperature"`
	MaxTokens          *int     `json:"maxTokens"`
	ContextWindowTurns *int     `json:"contextWindowTurns"`
}

type AttachmentDTO struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MIMEType string `json:"mimeType"`
	URL      string `json:"url"`
	Size     int64  `json:"size"`
}

type MessageDTO struct {
	ID             uint            `json:"id"`
	ConversationID uint            `json:"conversationId"`
	Role           string          `json:"role"`
	Content        string          `json:"content"`
	Attachments    []AttachmentDTO `json:"attachments"`
	Status         string          `json:"status"`
	CreatedAt      string          `json:"createdAt"`
}

type regenerateRequest struct {
	Options *ConversationSettings `json:"options"`
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) GetChatSettings(c *gin.Context) {
	user := auth.CurrentUser(c)
	settings, err := h.service.GetChatSettings(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get chat settings"})
		return
	}

	c.JSON(http.StatusOK, ToChatSettingsDTO(settings))
}

func (h *Handler) UpdateChatSettings(c *gin.Context) {
	user := auth.CurrentUser(c)

	var req ChatSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid chat settings payload"})
		return
	}

	settings, err := h.service.UpdateChatSettings(user.ID, req)
	if err != nil {
		handleChatError(c, err)
		return
	}

	c.JSON(http.StatusOK, ToChatSettingsDTO(settings))
}

func (h *Handler) ListConversations(c *gin.Context) {
	user := auth.CurrentUser(c)
	params, err := listConversationsParams(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.service.ListConversations(user.ID, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list conversations"})
		return
	}

	resp := make([]ConversationDTO, 0, len(result.Conversations))
	for _, conversation := range result.Conversations {
		effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, &conversation)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
			return
		}
		resp = append(resp, ToConversationDTO(&conversation, effectiveSettings))
	}

	c.JSON(http.StatusOK, gin.H{
		"conversations": resp,
		"total":         result.Total,
	})
}

func (h *Handler) CreateConversation(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversation, err := h.service.CreateConversation(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create conversation"})
		return
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"conversation": ToConversationDTO(conversation, effectiveSettings)})
}

func (h *Handler) ImportConversation(c *gin.Context) {
	user := auth.CurrentUser(c)

	var req ImportConversationInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid import payload"})
		return
	}

	conversation, err := h.service.ImportConversation(user.ID, req)
	if err != nil {
		handleChatError(c, err)
		return
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"conversation": ToConversationDTO(conversation, effectiveSettings)})
}

func (h *Handler) UpdateConversation(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	var req ConversationUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation payload"})
		return
	}

	conversation, err := h.service.UpdateConversation(user.ID, conversationID, req)
	if err != nil {
		handleChatError(c, err)
		return
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"conversation": ToConversationDTO(conversation, effectiveSettings)})
}

func (h *Handler) ListMessages(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	conversation, err := h.service.GetConversation(user.ID, conversationID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	messages, err := h.service.ListMessages(user.ID, conversationID)
	if err != nil {
		handleChatError(c, err)
		return
	}

	messageDTOs := make([]MessageDTO, 0, len(messages))
	for _, message := range messages {
		messageDTOs = append(messageDTOs, *ToMessageDTO(&message))
	}

	effectiveSettings, err := h.service.effectiveConversationSettings(user.ID, conversation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conversation": ToConversationDTO(conversation, effectiveSettings),
		"messages":     messageDTOs,
	})
}

func (h *Handler) DeleteConversation(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	if err := h.service.DeleteConversation(user.ID, conversationID); err != nil {
		handleChatError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) CancelGeneration(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	if err := h.service.CancelGeneration(user.ID, conversationID); err != nil {
		handleChatError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) StreamMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	var req SendMessageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.StreamAssistantReply(
			c.Request.Context(),
			user.ID,
			conversationID,
			req,
			writeEvent,
		)
	})
}

func (h *Handler) RetryMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}
	messageID, err := messageIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var req regenerateRequest
	if err := bindOptionalJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid retry payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.RetryAssistantMessage(
			c.Request.Context(),
			user.ID,
			conversationID,
			messageID,
			req.Options,
			writeEvent,
		)
	})
}

func (h *Handler) RegenerateMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	var req regenerateRequest
	if err := bindOptionalJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid regenerate payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.RegenerateLastAssistantReply(
			c.Request.Context(),
			user.ID,
			conversationID,
			req.Options,
			writeEvent,
		)
	})
}

func (h *Handler) RegenerateMessageByID(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}
	messageID, err := messageIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var req regenerateRequest
	if err := bindOptionalJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid regenerate payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.RegenerateAssistantMessage(
			c.Request.Context(),
			user.ID,
			conversationID,
			messageID,
			req.Options,
			writeEvent,
		)
	})
}

func (h *Handler) EditMessage(c *gin.Context) {
	user := auth.CurrentUser(c)
	conversationID, err := conversationIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}
	messageID, err := messageIDParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var req SendMessageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid edit payload"})
		return
	}

	h.streamAction(c, func(writeEvent func(StreamEvent) error) error {
		return h.service.EditUserMessageAndRegenerate(
			c.Request.Context(),
			user.ID,
			conversationID,
			messageID,
			req,
			writeEvent,
		)
	})
}

func (h *Handler) streamAction(
	c *gin.Context,
	action func(writeEvent func(StreamEvent) error) error,
) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming is unsupported"})
		return
	}

	started := false

	writeEvent := func(event StreamEvent) error {
		if !started {
			c.Writer.Header().Set("Content-Type", "text/event-stream")
			c.Writer.Header().Set("Cache-Control", "no-cache")
			c.Writer.Header().Set("Connection", "keep-alive")
			c.Writer.Header().Set("X-Accel-Buffering", "no")
			c.Status(http.StatusOK)
			started = true
		}

		payload, err := json.Marshal(event)
		if err != nil {
			return fmt.Errorf("marshal stream event: %w", err)
		}

		if _, err := c.Writer.Write([]byte("event: " + event.Type + "\n")); err != nil {
			return err
		}
		if _, err := c.Writer.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	if err := action(writeEvent); err != nil {
		if !started {
			handleChatError(c, err)
			return
		}

		_ = writeEvent(StreamEvent{
			Type:  "error",
			Error: errorMessage(err),
		})
	}
}

func listConversationsParams(c *gin.Context) (ListConversationsParams, error) {
	params := ListConversationsParams{
		Search: c.Query("search"),
	}

	if archivedRaw := c.Query("archived"); archivedRaw != "" {
		archived, err := strconv.ParseBool(archivedRaw)
		if err != nil {
			return ListConversationsParams{}, errors.New("archived must be a boolean")
		}
		params.Archived = archived
	}

	if limitRaw := c.Query("limit"); limitRaw != "" {
		limit, err := strconv.Atoi(limitRaw)
		if err != nil {
			return ListConversationsParams{}, errors.New("limit must be a number")
		}
		params.Limit = limit
	}

	if offsetRaw := c.Query("offset"); offsetRaw != "" {
		offset, err := strconv.Atoi(offsetRaw)
		if err != nil {
			return ListConversationsParams{}, errors.New("offset must be a number")
		}
		params.Offset = offset
	}

	return params, nil
}

func conversationIDParam(c *gin.Context) (uint, error) {
	rawID := c.Param("id")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

func messageIDParam(c *gin.Context) (uint, error) {
	rawID := c.Param("messageId")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

func bindOptionalJSON(c *gin.Context, target any) error {
	if c.Request.Body == nil || c.Request.ContentLength == 0 {
		return nil
	}

	if err := c.ShouldBindJSON(target); err != nil {
		if errors.Is(err, io.EOF) {
			return nil
		}
		return err
	}
	return nil
}

func ToConversationDTO(
	conversation *models.Conversation,
	settings ConversationSettings,
) ConversationDTO {
	return ConversationDTO{
		ID:         conversation.ID,
		Title:      conversation.Title,
		IsPinned:   conversation.IsPinned,
		IsArchived: conversation.IsArchived,
		Settings: ConversationSettingsDTO{
			SystemPrompt:       settings.SystemPrompt,
			Model:              settings.Model,
			Temperature:        cloneFloat32(settings.Temperature),
			MaxTokens:          cloneInt(settings.MaxTokens),
			ContextWindowTurns: cloneInt(settings.ContextWindowTurns),
		},
		CreatedAt: conversation.CreatedAt.Format(timeFormat),
		UpdatedAt: conversation.UpdatedAt.Format(timeFormat),
	}
}

func ToChatSettingsDTO(settings ChatSettings) ChatSettingsDTO {
	return ChatSettingsDTO{
		GlobalPrompt:       settings.GlobalPrompt,
		Model:              settings.Model,
		Temperature:        cloneFloat32(settings.Temperature),
		MaxTokens:          cloneInt(settings.MaxTokens),
		ContextWindowTurns: cloneInt(settings.ContextWindowTurns),
	}
}

func ToMessageDTO(message *models.Message) *MessageDTO {
	attachments := make([]AttachmentDTO, 0, len(message.Attachments))
	for _, attachment := range message.Attachments {
		attachments = append(attachments, AttachmentDTO{
			ID:       attachment.ID,
			Name:     attachment.Name,
			MIMEType: attachment.MIMEType,
			URL:      attachment.URL,
			Size:     attachment.Size,
		})
	}

	return &MessageDTO{
		ID:             message.ID,
		ConversationID: message.ConversationID,
		Role:           message.Role,
		Content:        message.Content,
		Attachments:    attachments,
		Status:         message.Status,
		CreatedAt:      message.CreatedAt.Format(timeFormat),
	}
}

func handleChatError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation or message not found"})
	case errors.Is(err, ErrConversationBusy),
		errors.Is(err, ErrNoActiveGeneration),
		errors.Is(err, ErrInvalidRetryAction),
		errors.Is(err, ErrInvalidRegenerateAction),
		errors.Is(err, ErrInvalidUserEdit):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, provider.ErrNoProviderConfigured):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	case isRequestError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "chat request failed"})
	}
}

func errorMessage(err error) string {
	if err == nil {
		return "chat request failed"
	}
	if isRequestError(err) || errors.Is(err, ErrConversationBusy) ||
		errors.Is(err, ErrNoActiveGeneration) ||
		errors.Is(err, ErrInvalidRetryAction) ||
		errors.Is(err, ErrInvalidRegenerateAction) ||
		errors.Is(err, ErrInvalidUserEdit) ||
		errors.Is(err, provider.ErrNoProviderConfigured) ||
		errors.Is(err, gorm.ErrRecordNotFound) {
		return err.Error()
	}
	return "chat request failed"
}

const timeFormat = "2006-01-02T15:04:05Z07:00"
