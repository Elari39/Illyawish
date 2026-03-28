package attachment

import "strings"

type PreparedKnowledgeUpload struct {
	MIMEType string
	Content  string
}

func PrepareKnowledgeUpload(filename string, payload []byte) (*PreparedKnowledgeUpload, error) {
	mimeType, _, err := normalizeUploadMetadata(filename, payload)
	if err != nil {
		return nil, err
	}
	if mimeType != mimeTypePDF && mimeType != mimeTypeMarkdown && mimeType != mimeTypePlain {
		return nil, requestError{message: "only PDF, Markdown, and TXT attachments are supported"}
	}

	content, err := extractAttachmentText(mimeType, payload)
	if err != nil {
		return nil, err
	}

	return &PreparedKnowledgeUpload{
		MIMEType: mimeType,
		Content:  strings.TrimSpace(truncateAttachmentText(content)),
	}, nil
}
