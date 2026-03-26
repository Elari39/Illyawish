package attachment

import (
	"bytes"
	"fmt"
	"math"
	"mime"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"

	"rsc.io/pdf"
)

const (
	mimeTypePDF      = "application/pdf"
	mimeTypeMarkdown = "text/markdown"
	mimeTypePlain    = "text/plain"

	maxAttachmentTextChars = 12000
)

func normalizeUploadMetadata(filename string, payload []byte) (string, string, error) {
	extension := strings.ToLower(strings.TrimSpace(filepath.Ext(filename)))
	detectedMIMEType := detectMIMEType(payload)

	switch {
	case strings.HasPrefix(detectedMIMEType, "image/"):
		return detectedMIMEType, normalizeExtension(extension, detectedMIMEType), nil
	case extension == ".pdf" || detectedMIMEType == mimeTypePDF:
		return mimeTypePDF, ".pdf", nil
	case extension == ".md" || extension == ".markdown":
		if isTextLikeMIMEType(detectedMIMEType) {
			return mimeTypeMarkdown, extension, nil
		}
	case extension == ".txt":
		if isTextLikeMIMEType(detectedMIMEType) {
			return mimeTypePlain, extension, nil
		}
	case detectedMIMEType == mimeTypePlain && (extension == "" || extension == ".txt"):
		return mimeTypePlain, normalizeExtension(extension, mimeTypePlain), nil
	}

	return "", "", requestError{message: "only image, PDF, Markdown, and TXT attachments are supported"}
}

func detectMIMEType(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}

	detected := strings.TrimSpace(http.DetectContentType(payload[:min(len(payload), 512)]))
	if mediaType, _, err := mimeParseMediaType(detected); err == nil && mediaType != "" {
		return mediaType
	}
	return detected
}

func isTextLikeMIMEType(mimeType string) bool {
	switch strings.TrimSpace(mimeType) {
	case mimeTypePlain, "application/octet-stream":
		return true
	default:
		return false
	}
}

func normalizeExtension(extension string, mimeType string) string {
	if extension != "" {
		return extension
	}

	switch mimeType {
	case mimeTypePDF:
		return ".pdf"
	case mimeTypeMarkdown:
		return ".md"
	case mimeTypePlain:
		return ".txt"
	default:
		return ""
	}
}

func extractAttachmentText(mimeType string, payload []byte) (string, error) {
	switch mimeType {
	case mimeTypePlain, mimeTypeMarkdown:
		if !utf8.Valid(payload) {
			return "", requestError{message: "text attachments must be valid UTF-8"}
		}
		return string(payload), nil
	case mimeTypePDF:
		text, err := extractPDFText(payload)
		if err != nil {
			return "", requestError{message: "PDF attachments must contain readable text"}
		}
		if strings.TrimSpace(text) == "" {
			return "", requestError{message: "PDF attachments must contain readable text"}
		}
		return text, nil
	default:
		return "", nil
	}
}

func truncateAttachmentText(text string) string {
	runes := []rune(text)
	if len(runes) <= maxAttachmentTextChars {
		return text
	}

	return string(runes[:maxAttachmentTextChars]) +
		fmt.Sprintf("\n\n[Attachment text truncated after %d characters.]", maxAttachmentTextChars)
}

func extractPDFText(payload []byte) (text string, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("extract pdf text: %v", recovered)
		}
	}()

	reader, err := pdf.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return "", fmt.Errorf("open pdf reader: %w", err)
	}

	var pages []string
	for pageNumber := 1; pageNumber <= reader.NumPage(); pageNumber++ {
		page := reader.Page(pageNumber)
		if page.V.IsNull() {
			continue
		}

		pageText := extractPDFPageText(page.Content().Text)
		if strings.TrimSpace(pageText) == "" {
			continue
		}
		pages = append(pages, pageText)
	}

	return strings.Join(pages, "\n\n"), nil
}

func extractPDFPageText(textItems []pdf.Text) string {
	if len(textItems) == 0 {
		return ""
	}

	sort.Sort(pdf.TextVertical(textItems))

	var lines []string
	var currentLine strings.Builder
	lastY := textItems[0].Y
	lastEndX := textItems[0].X
	lastFontSize := textItems[0].FontSize

	for index, item := range textItems {
		if index == 0 {
			currentLine.WriteString(item.S)
			lastEndX = item.X + item.W
			lastFontSize = item.FontSize
			continue
		}

		lineBreakThreshold := math.Max(lastFontSize*0.8, 4)
		if math.Abs(item.Y-lastY) > lineBreakThreshold {
			lines = append(lines, strings.TrimSpace(currentLine.String()))
			currentLine.Reset()
			currentLine.WriteString(item.S)
			lastY = item.Y
			lastEndX = item.X + item.W
			lastFontSize = item.FontSize
			continue
		}

		spaceThreshold := math.Max(lastFontSize*0.01, 0.1)
		if item.X-lastEndX > spaceThreshold {
			currentLine.WriteByte(' ')
		}
		currentLine.WriteString(item.S)
		lastEndX = item.X + item.W
		lastFontSize = item.FontSize
	}

	if line := strings.TrimSpace(currentLine.String()); line != "" {
		lines = append(lines, line)
	}

	return strings.Join(lines, "\n")
}

func mimeParseMediaType(value string) (string, map[string]string, error) {
	return mime.ParseMediaType(value)
}
