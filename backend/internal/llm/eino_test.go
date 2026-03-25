package llm

import (
	"context"
	"errors"
	"io"
	"testing"

	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type fakeBaseChatModel struct {
	stream *schema.StreamReader[*schema.Message]
	err    error
}

func (f *fakeBaseChatModel) Generate(context.Context, []*schema.Message, ...einomodel.Option) (*schema.Message, error) {
	return nil, errors.New("not implemented")
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
		model: &fakeBaseChatModel{
			stream: schema.StreamReaderFromArray([]*schema.Message{
				schema.AssistantMessage("Hello ", nil),
				schema.AssistantMessage("World", nil),
				schema.AssistantMessage("", nil),
			}),
		},
	}

	var chunks []string
	fullText, err := model.Stream(context.Background(), []ChatMessage{
		{Role: "user", Content: "hi"},
	}, RequestOptions{}, func(delta string) {
		chunks = append(chunks, delta)
	})
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
		model: &fakeBaseChatModel{
			err: errors.New("upstream unavailable"),
		},
	}

	_, err := model.Stream(context.Background(), nil, RequestOptions{}, func(string) {})
	if err == nil {
		t.Fatal("expected start error, got nil")
	}
	if err.Error() != "start model stream: upstream unavailable" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEinoChatModelStreamReturnsReadErrors(t *testing.T) {
	model := &EinoChatModel{
		model: &failingStreamModel{},
	}

	fullText, err := model.Stream(context.Background(), nil, RequestOptions{}, func(string) {})
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
		model: &fakeBaseChatModel{
			stream: schema.StreamReaderWithConvert[int, *schema.Message](
				schema.StreamReaderFromArray([]int{1}),
				func(value int) (*schema.Message, error) {
					if value == 1 {
						return schema.AssistantMessage("done", nil), nil
					}
					return nil, io.EOF
				},
			),
		},
	}

	fullText, err := model.Stream(context.Background(), nil, RequestOptions{}, func(string) {})
	if err != nil {
		t.Fatalf("expected EOF to end cleanly, got error %v", err)
	}
	if fullText != "done" {
		t.Fatalf("expected full text to be %q, got %q", "done", fullText)
	}
}
