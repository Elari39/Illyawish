package llm

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/cloudwego/eino-ext/components/model/openai"
	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type fakeBaseChatModel struct {
	stream      *schema.StreamReader[*schema.Message]
	err         error
	generated   *schema.Message
	generateErr error
}

func (f *fakeBaseChatModel) Generate(context.Context, []*schema.Message, ...einomodel.Option) (*schema.Message, error) {
	if f.generateErr != nil {
		return nil, f.generateErr
	}
	return f.generated, nil
}

func (f *fakeBaseChatModel) Stream(context.Context, []*schema.Message, ...einomodel.Option) (*schema.StreamReader[*schema.Message], error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.stream, nil
}

type failingStreamModel struct{}

func (f *failingStreamModel) Generate(context.Context, []*schema.Message, ...einomodel.Option) (*schema.Message, error) {
	return nil, errors.New("not implemented")
}

func (f *failingStreamModel) Stream(context.Context, []*schema.Message, ...einomodel.Option) (*schema.StreamReader[*schema.Message], error) {
	return schema.StreamReaderWithConvert[int, *schema.Message](
		schema.StreamReaderFromArray([]int{1, 2}),
		func(value int) (*schema.Message, error) {
			if value == 2 {
				return nil, errors.New("stream exploded")
			}
			return schema.AssistantMessage("Hello ", nil), nil
		},
	), nil
}

func TestEinoChatModelStreamAggregatesChunks(t *testing.T) {
	model := &EinoChatModel{
		newChatModel: func(context.Context, *openai.ChatModelConfig) (einomodel.BaseChatModel, error) {
			return &fakeBaseChatModel{
				stream: schema.StreamReaderFromArray([]*schema.Message{
					schema.AssistantMessage("Hello ", nil),
					schema.AssistantMessage("World", nil),
					schema.AssistantMessage("", nil),
				}),
			}, nil
		},
	}

	var chunks []string
	fullText, err := model.Stream(
		context.Background(),
		ProviderConfig{
			BaseURL:      "https://example.com/v1",
			APIKey:       "test-key",
			DefaultModel: "default-model",
		},
		[]ChatMessage{{Role: "user", Content: "hi"}},
		RequestOptions{},
		func(delta string) {
			chunks = append(chunks, delta)
		},
	)
	if err != nil {
		t.Fatalf("Stream() error = %v", err)
	}

	if fullText != "Hello World" {
		t.Fatalf("expected full text to be %q, got %q", "Hello World", fullText)
	}
	if len(chunks) != 2 {
		t.Fatalf("expected 2 emitted chunks, got %d", len(chunks))
	}
}

func TestEinoChatModelStreamReturnsStartErrors(t *testing.T) {
	model := &EinoChatModel{
		newChatModel: func(context.Context, *openai.ChatModelConfig) (einomodel.BaseChatModel, error) {
			return &fakeBaseChatModel{
				err: errors.New("upstream unavailable"),
			}, nil
		},
	}

	_, err := model.Stream(context.Background(), ProviderConfig{
		BaseURL:      "https://example.com/v1",
		APIKey:       "test-key",
		DefaultModel: "default-model",
	}, nil, RequestOptions{}, func(string) {})
	if err == nil {
		t.Fatal("expected start error, got nil")
	}
	if err.Error() != "start model stream: upstream unavailable" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEinoChatModelFallsBackToGenerateOnEOFStartError(t *testing.T) {
	model := &EinoChatModel{
		newChatModel: func(context.Context, *openai.ChatModelConfig) (einomodel.BaseChatModel, error) {
			return &fakeBaseChatModel{
				err:       errors.New("Post https://example.com/v1/chat/completions: EOF"),
				generated: schema.AssistantMessage("Fallback response", nil),
			}, nil
		},
	}

	var chunks []string
	fullText, err := model.Stream(context.Background(), ProviderConfig{
		BaseURL:      "https://example.com/v1",
		APIKey:       "test-key",
		DefaultModel: "default-model",
	}, nil, RequestOptions{}, func(delta string) {
		chunks = append(chunks, delta)
	})
	if err != nil {
		t.Fatalf("expected fallback generate to succeed, got error %v", err)
	}

	if fullText != "Fallback response" {
		t.Fatalf("expected fallback response, got %q", fullText)
	}
	if len(chunks) != 1 || chunks[0] != "Fallback response" {
		t.Fatalf("expected a single fallback chunk, got %#v", chunks)
	}
}

func TestEinoChatModelStreamReturnsReadErrors(t *testing.T) {
	model := &EinoChatModel{
		newChatModel: func(context.Context, *openai.ChatModelConfig) (einomodel.BaseChatModel, error) {
			return &failingStreamModel{}, nil
		},
	}

	fullText, err := model.Stream(context.Background(), ProviderConfig{
		BaseURL:      "https://example.com/v1",
		APIKey:       "test-key",
		DefaultModel: "default-model",
	}, nil, RequestOptions{}, func(string) {})
	if err == nil {
		t.Fatal("expected read error, got nil")
	}
	if fullText != "Hello " {
		t.Fatalf("expected partial content to be preserved, got %q", fullText)
	}
	if err.Error() != "read model stream: stream exploded" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEinoChatModelStreamStopsOnEOF(t *testing.T) {
	model := &EinoChatModel{
		newChatModel: func(context.Context, *openai.ChatModelConfig) (einomodel.BaseChatModel, error) {
			return &fakeBaseChatModel{
				stream: schema.StreamReaderWithConvert[int, *schema.Message](
					schema.StreamReaderFromArray([]int{1}),
					func(value int) (*schema.Message, error) {
						if value == 1 {
							return schema.AssistantMessage("done", nil), nil
						}
						return nil, io.EOF
					},
				),
			}, nil
		},
	}

	fullText, err := model.Stream(context.Background(), ProviderConfig{
		BaseURL:      "https://example.com/v1",
		APIKey:       "test-key",
		DefaultModel: "default-model",
	}, nil, RequestOptions{}, func(string) {})
	if err != nil {
		t.Fatalf("expected EOF to end cleanly, got error %v", err)
	}
	if fullText != "done" {
		t.Fatalf("expected full text to be %q, got %q", "done", fullText)
	}
}

func TestBuildChatModelConfigUsesProviderDefaults(t *testing.T) {
	cfg, err := buildChatModelConfig(ProviderConfig{
		BaseURL:      "https://example.com/v1",
		APIKey:       "secret-key",
		DefaultModel: "provider-model",
	}, RequestOptions{})
	if err != nil {
		t.Fatalf("buildChatModelConfig() error = %v", err)
	}

	if cfg.BaseURL != "https://example.com/v1" {
		t.Fatalf("expected base URL to be preserved, got %q", cfg.BaseURL)
	}
	if cfg.APIKey != "secret-key" {
		t.Fatalf("expected API key to be preserved, got %q", cfg.APIKey)
	}
	if cfg.Model != "provider-model" {
		t.Fatalf("expected provider default model, got %q", cfg.Model)
	}
}

func TestToSchemaMessagesOrdersUserTextDocumentAndImages(t *testing.T) {
	messages := toSchemaMessages([]ChatMessage{
		{
			Role:    "user",
			Content: "Please review these attachments.",
			Attachments: []Attachment{
				{
					Kind:     AttachmentKindText,
					Name:     "notes.txt",
					MIMEType: "text/plain",
					Text:     "Important notes",
				},
				{
					Kind:     AttachmentKindImage,
					Name:     "diagram.png",
					MIMEType: "image/png",
					URL:      "data:image/png;base64,abc",
				},
			},
		},
	})

	if len(messages) != 1 {
		t.Fatalf("expected 1 schema message, got %d", len(messages))
	}

	parts := messages[0].UserInputMultiContent
	if len(parts) != 3 {
		t.Fatalf("expected 3 message parts, got %d", len(parts))
	}
	if parts[0].Type != schema.ChatMessagePartTypeText || parts[0].Text != "Please review these attachments." {
		t.Fatalf("unexpected first part: %#v", parts[0])
	}
	if parts[1].Type != schema.ChatMessagePartTypeText {
		t.Fatalf("expected second part to be text, got %#v", parts[1])
	}
	if parts[1].Text != "Attachment: notes.txt\nType: text/plain\nContent:\nImportant notes" {
		t.Fatalf("unexpected attachment text block: %q", parts[1].Text)
	}
	if parts[2].Type != schema.ChatMessagePartTypeImageURL || parts[2].Image == nil {
		t.Fatalf("expected third part to be image, got %#v", parts[2])
	}
	if parts[2].Image.URL == nil || *parts[2].Image.URL != "data:image/png;base64,abc" {
		t.Fatalf("unexpected image URL: %#v", parts[2].Image)
	}
}
