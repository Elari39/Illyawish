package chat

import "backend/internal/models"

type ConversationDTO struct {
	ID                string                  `json:"id"`
	Title             string                  `json:"title"`
	IsPinned          bool                    `json:"isPinned"`
	IsArchived        bool                    `json:"isArchived"`
	Folder            string                  `json:"folder"`
	Tags              []string                `json:"tags"`
	WorkflowPresetID  *uint                   `json:"workflowPresetId,omitempty"`
	KnowledgeSpaceIDs []uint                  `json:"knowledgeSpaceIds"`
	Settings          ConversationSettingsDTO `json:"settings"`
	CreatedAt         string                  `json:"createdAt"`
	UpdatedAt         string                  `json:"updatedAt"`
}

type ConversationSettingsDTO struct {
	SystemPrompt       string   `json:"systemPrompt"`
	ProviderPresetID   *uint    `json:"providerPresetId"`
	Model              string   `json:"model"`
	Temperature        *float32 `json:"temperature"`
	MaxTokens          *int     `json:"maxTokens"`
	ContextWindowTurns *int     `json:"contextWindowTurns"`
}

type ChatSettingsDTO struct {
	GlobalPrompt       string   `json:"globalPrompt"`
	ProviderPresetID   *uint    `json:"providerPresetId"`
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
	ID             uint                   `json:"id"`
	ConversationID string                 `json:"conversationId"`
	Role           string                 `json:"role"`
	Content        string                 `json:"content"`
	Attachments    []AttachmentDTO        `json:"attachments"`
	Status         string                 `json:"status"`
	RunSummary     models.AgentRunSummary `json:"runSummary"`
	CreatedAt      string                 `json:"createdAt"`
}

type MessagePaginationDTO struct {
	HasMore      bool  `json:"hasMore"`
	NextBeforeID *uint `json:"nextBeforeId"`
}

func ToConversationDTO(
	conversation *models.Conversation,
	settings ConversationSettings,
) ConversationDTO {
	tags := append([]string(nil), conversation.Tags...)
	if tags == nil {
		tags = []string{}
	}

	return ConversationDTO{
		ID:                conversation.PublicID,
		Title:             conversation.Title,
		IsPinned:          conversation.IsPinned,
		IsArchived:        conversation.IsArchived,
		Folder:            conversation.Folder,
		Tags:              tags,
		WorkflowPresetID:  conversation.WorkflowPresetID,
		KnowledgeSpaceIDs: cloneUintSlice(conversation.KnowledgeSpaceIDs),
		Settings: ConversationSettingsDTO{
			SystemPrompt:       settings.SystemPrompt,
			ProviderPresetID:   cloneUint(settings.ProviderPresetID),
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
		ProviderPresetID:   cloneUint(settings.ProviderPresetID),
		Model:              settings.Model,
		Temperature:        cloneFloat32(settings.Temperature),
		MaxTokens:          cloneInt(settings.MaxTokens),
		ContextWindowTurns: cloneInt(settings.ContextWindowTurns),
	}
}

func ToMessageDTO(message *models.Message, conversationPublicID string) *MessageDTO {
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
		ConversationID: conversationPublicID,
		Role:           message.Role,
		Content:        message.Content,
		Attachments:    attachments,
		Status:         message.Status,
		RunSummary:     message.RunSummary,
		CreatedAt:      message.CreatedAt.Format(timeFormat),
	}
}

const timeFormat = "2006-01-02T15:04:05Z07:00"
